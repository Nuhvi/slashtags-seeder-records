import _DHT from '@hyperswarm/dht'
import sodium from 'sodium-universal'
import c from 'compact-encoding'
import b4a from 'b4a'
import crypto from 'hypercore-crypto'

const COMMANDS = {
  PUT: 100,
  GET: 101
}

const [NS] = crypto.namespace('@slashtags/seeders-record', 1)

const valueEncoding = c.array(c.string)

const putRequest = {
  preencode (state, m) {
    c.fixed32.preencode(state, m.publicKey)
    c.uint.preencode(state, m.seq)
    valueEncoding.preencode(state, m.value)
    c.fixed64.preencode(state, m.signature)
  },
  encode (state, m) {
    c.fixed32.encode(state, m.publicKey)
    c.uint.encode(state, m.seq)
    valueEncoding.encode(state, m.value)
    c.fixed64.encode(state, m.signature)
  },
  decode (state) {
    return {
      publicKey: c.fixed32.decode(state),
      seq: c.uint.decode(state),
      value: valueEncoding.decode(state),
      signature: c.fixed64.decode(state)
    }
  }
}

const putSignable = {
  preencode (state, m) {
    c.uint.preencode(state, m.seq)
    valueEncoding.preencode(state, m.value)
  },
  encode (state, m) {
    c.uint.encode(state, m.seq)
    valueEncoding.encode(state, m.value)
  },
  decode (state) {
    return {
      seq: c.uint.decode(state),
      value: valueEncoding.decode(state)
    }
  }
}

const getResponse = {
  preencode (state, m) {
    c.uint.preencode(state, m.seq)
    valueEncoding.preencode(state, m.value)
    c.fixed64.preencode(state, m.signature)
  },
  encode (state, m) {
    c.uint.encode(state, m.seq)
    valueEncoding.encode(state, m.value)
    c.fixed64.encode(state, m.signature)
  },
  decode (state) {
    return {
      seq: c.uint.decode(state),
      value: valueEncoding.decode(state),
      signature: c.fixed64.decode(state)
    }
  }
}

const encoding = {
  putRequest,
  putSignable,
  getResponse,
  valueEncoding
}

export default class DHT extends _DHT {
  constructor (opts) {
    super(opts)

    this.mutables = new Map()
  }

  /**
   * @param {string || string[]} value
   */
  async put (value, opts = {}) {
    if(typeof value === 'string') value = [value]

    const keyPair = opts.keyPair || this.defaultKeyPair

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

    // use seq = 0, for the query part here, as we don't care about the actual values
    const query = this.query({ target, command: COMMANDS.GET, value: c.encode(c.uint, 0) }, opts)
    await query.finished()

    return { publicKey: keyPair.publicKey, closestNodes: query.closestNodes, seq, signature }
  }

  async get (publicKey, opts = {}) {
    let refresh = opts.refresh || null
    let signed = null
    let result = null

    opts = { ...opts, map: mapRecord, commit: refresh ? commit : null }

    const target = b4a.allocUnsafe(32)
    sodium.crypto_generichash(target, publicKey)

    const userSeq = opts.seq || 0
    const query = this.query({ target, command: COMMANDS.GET, value: c.encode(c.uint, userSeq) }, opts)
    const latest = opts.latest !== false

    for await (const node of query) {
      if (result && node.seq <= result.seq) continue
      if (node.seq < userSeq || !verifyRecord(node.signature, node.seq, node.value, publicKey)) continue
      if (!latest) return node
      if (!result || node.seq > result.seq) result = node
    }

    return result

    function commit (reply, dht) {
      if (!signed && result && refresh) {
        if (refresh(result)) {
          signed = c.encode(encoding.putRequest, {
            publicKey,
            seq: result.seq,
            value: result.value,
            signature: result.signature
          })
        } else {
          refresh = null
        }
      }

      return signed ? dht.request({ token: reply.token, target, command: COMMANDS.MUTABLE_PUT, value: signed }, reply.from) : Promise.resolve(null)
    }
  }

  onrequest (req) {
    super.onrequest(req)
    switch (req.command) {
      case COMMANDS.PUT:
        this.onPut(req)
        return this.onPut(req)

      case COMMANDS.GET:
        return this.onGet(req)

      default:
        return
    }
  }

  onPut (req) {
    if (!req.target || !req.token || !req.value) return

    const p = decode(encoding.putRequest, req.value)
    if (!p) return

    const { publicKey, seq, value, signature } = p

    const hash = b4a.allocUnsafe(32)
    sodium.crypto_generichash(hash, publicKey)
    if (!b4a.equals(hash, req.target)) return

    if (!value || !verifyRecord(signature, seq, value, publicKey)) return

    const k = b4a.toString(hash, 'hex')
    const local = this.mutables.get(k)

    if (local) {
      const existing = c.decode(encoding.getResponse, local)
      if (!seq > existing.seq) {
        // None of this should happen so don't worry about it for now!
        // req.error(ERROR.SEQ_TOO_LOW)
        return
      }
    }

    this.mutables.set(k, c.encode(encoding.getResponse, { seq, value, signature }))
    req.reply(null)
  }

  onGet (req) {
    if (!req.target || !req.value) return

    let seq = 0
    try {
      seq = c.decode(c.uint, req.value)
    } catch {
      return
    }

    const k = b4a.toString(req.target, 'hex')
    const value = this.mutables.get(k)

    if (!value) {
      req.reply(null)
      return
    }

    const localSeq = c.decode(c.uint, value)
    req.reply(localSeq < seq ? null : value)
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
