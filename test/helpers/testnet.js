// @ts-nocheck
import DHT from '../../index.js'
import path from 'path'

export default async function createTestnet (size = 10, opts = {}) {
  const swarm = []
  const teardown = typeof opts === 'function' ? opts : (opts.teardown ? opts.teardown.bind(opts) : noop)
  const host = opts.host || '127.0.0.1'
  const port = opts.port || 0

  if (size === 0) return new Testnet(swarm)

  const first = new DHT({
    ephemeral: false,
    firewalled: false,
    bootstrap: [],
    bind: port,
    storage: opts.storage ? path.join(opts.storage, '0') : null
  })

  await first.ready()
  const bootstrap = [{ host, port: first.address().port }]

  swarm.push(first)

  while (swarm.length < size) {
    const node = new DHT({
      ephemeral: false,
      firewalled: false,
      bootstrap,
      storage: opts.storage ? path.join(opts.storage, swarm.length.toString()) : null
    })

    await node.ready()
    swarm.push(node)
  }

  const testnet = new Testnet(swarm, bootstrap)

  teardown(async function () {
    await testnet.destroy()
  }, { order: Infinity })

  return testnet
}

class Testnet {
  constructor (nodes, bootstrap = []) {
    /** @type {import("../../index.js").default[]} */
    this.nodes = nodes
    this.bootstrap = bootstrap
  }

  createNode (opts = {}) {
    const node = new DHT({
      ephemeral: true,
      bootstrap: this.bootstrap,
      ...opts
    })

    this.nodes.push(node)

    return node
  }

  async destroy () {
    for (const node of this.nodes) {
      await node.destroy()
    }
  }

  [Symbol.iterator] () {
    return this.nodes[Symbol.iterator]()
  }
}

function noop () {}
