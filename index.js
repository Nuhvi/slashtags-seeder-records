import _DHT from '@hyperswarm/dht'
import sodium from 'sodium-universal'
import c from 'compact-encoding'
import b4a from 'b4a'
import { Level } from 'level'

import Cache from './lib/cache.js'
import * as encoding from './lib/messages.js'
import { COMMANDS, NS } from './lib/constants.js'

export default class DHT extends _DHT {
  /**
   * @param {object} [opts]
   * @param {string} [opts.storage] Disk storage
   */
  constructor (opts = {}) {
    // @ts-ignore
    opts.bootstrap = opts.bootstrap || [
      { host: '167.86.102.121', port: 45471 },
      { host: '167.86.102.121', port: 45472 },
      { host: '167.86.102.121', port: 45473 }
    ]
    
    super(opts)

    /** @type {Level<string, Uint8Array>} */
    this.db = opts.storage && new Level(opts.storage, { valueEncoding: 'binary' })
    this.cache = new Cache()

    // @type {{ publicKey: Uint8Array, secretKey: Uint8Array }}
    // @ts-ignore
    this.keyPair = this.defaultKeyPair
    this.key = this.keyPair.publicKey
  }

  async ready () {
    await super.ready()
    if (this.db) return this.db.open()
  }

  /**
   * @param {string | string[]} value
   */
  async put (value, opts = {}) {
    if (typeof value === 'string') value = [value]

    const keyPair = opts.keyPair || this.keyPair

    const target = b4a.allocUnsafe(32)
    sodium.crypto_generichash(target, keyPair.publicKey)

    const seq = opts.seq || Date.now()
    const signature = await signRecord(seq, value, keyPair)

    const signed = c.encode(encoding.putRequest, {
      publicKey: keyPair.publicKey,
      seq,
      value,
      signature
    })

    opts = {
      ...opts,
      map: mapRecord,
      commit (reply, dht) {
        return dht.request({ token: reply.token, target, command: COMMANDS.PUT, value: signed }, reply.from)
      }
    }

    // @ts-ignore
    const query = this.query({ target, command: COMMANDS.GET, value: c.encode(c.uint, 0) }, opts)
    await query.finished()

    return { publicKey: keyPair.publicKey, seq, signature }
  }

  /**
   * @param {Uint8Array} publicKey
   * @returns {Promise<import('./lib/constants').Record>}
   */
  async get (publicKey, opts = {}) {
    let result = null

    opts = { ...opts, map: mapRecord }

    const target = b4a.allocUnsafe(32)
    sodium.crypto_generichash(target, publicKey)

    const userSeq = opts.seq || 0
    const latest = opts.latest !== false
    // @ts-ignore
    const query = this.query({ target, command: COMMANDS.GET, value: c.encode(c.uint, userSeq) }, opts)

    for await (const node of query) {
      if (result && node.seq <= result.seq) continue
      if (node.seq < userSeq || !verifyRecord(node.signature, node.seq, node.value, publicKey)) continue
      if (!latest) return node
      if (!result || node.seq > result.seq) result = node
    }

    return result
  }

  onrequest (req) {
    // TODO: remove all unnecessary commands.
    super.onrequest(req)

    switch (req.command) {
      case COMMANDS.PUT:
        this.onPut(req)
        return this.onPut(req)

      case COMMANDS.GET:
        return this.onGet(req)

      default:
    }

    return false
  }

  async onPut (req) {
    if (!req.target || !req.token || !req.value) return

    const p = decode(encoding.putRequest, req.value)
    if (!p) return

    const { publicKey, seq, value, signature } = p

    const hash = b4a.allocUnsafe(32)
    sodium.crypto_generichash(hash, publicKey)
    if (!b4a.equals(hash, req.target)) return

    if (!value || !verifyRecord(signature, seq, value, publicKey)) return

    const k = b4a.toString(hash, 'hex')
    const local = await this._get(k)

    if (local) {
      const existing = c.decode(encoding.getResponse, local)
      if (!seq > existing.seq) {
        // None of this should happen so don't worry about it for now!
        // req.error(ERROR.SEQ_TOO_LOW)
        return
      }
    }

    this._put(k, { seq, value, signature })
    req.reply(null)
  }

  async onGet (req) {
    if (!req.target || !req.value) return

    let seq = 0
    try {
      seq = c.decode(c.uint, req.value)
    } catch {
      return
    }

    const k = b4a.toString(req.target, 'hex')
    const value = await this._get(k)

    if (!value) {
      req.reply(null)
      return
    }

    const localSeq = c.decode(c.uint, value)
    req.reply(localSeq < seq ? null : value)
  }

  /**
   * @param {string} key
   * @param {import('./lib/constants').Record} value
   */
  async _put (key, value) {
    const encoded = c.encode(encoding.getResponse, value)
    this.db && await this.db.put(key, encoded)
    this.cache.set(key, encoded)
  }

  /**
   * @param {string} key
   */
  async _get (key) {
    const cached = this.cache.get(key)
    if (cached) return cached
    if (!this.db) return null
    try {
      const saved = await this.db.get(key)
      this.cache.set(key, saved)
      return saved
    } catch (error) {
      return null
    }
  }

  async destroy () {
    await super.destroy()
    return this.db?.close()
  }
}

function mapRecord (node) {
  if (!node.value) return null

  try {
    const { seq, value, signature } = c.decode(encoding.getResponse, node.value)

    return {
      token: node.token,
      from: node.from,
      to: node.to,
      seq,
      value,
      signature
    }
  } catch {
    return null
  }
}

function decode (enc, val) {
  try {
    return val && c.decode(enc, val)
  } catch (err) {
    return null
  }
}

function signRecord (seq, value, keyPair) {
  const signable = b4a.allocUnsafe(32 + 32)
  const hash = signable.subarray(32)

  signable.set(NS, 0)

  sodium.crypto_generichash(hash, c.encode(encoding.putSignable, { seq, value }))
  return sign(signable, keyPair)
}

function sign (signable, keyPair) {
  if (keyPair.sign) {
    return keyPair.sign(signable)
  }
  const secretKey = keyPair.secretKey ? keyPair.secretKey : keyPair
  const signature = b4a.allocUnsafe(64)
  sodium.crypto_sign_detached(signature, signable, secretKey)
  return signature
}

function verifyRecord (signature, seq, value, publicKey) {
  const signable = b4a.allocUnsafe(32 + 32)
  const hash = signable.subarray(32)

  signable.set(NS, 0)

  sodium.crypto_generichash(hash, c.encode(encoding.putSignable, { seq, value }))
  return sodium.crypto_sign_verify_detached(signature, signable, publicKey)
}
