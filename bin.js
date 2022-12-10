#!/usr/bin/env node

import DHT from './index.js'

const command = process.argv[2]

switch (command) {
  case 'run':
    run()
    break
  case 'put':
    put()
    break
  case 'get':
    get()
    break
  default:
    console.log(`
    Help - Slashtags router is an experiment in using Hyperswarm dht for storing 
           records to the seeders and other servers for a slashtag.

    - run : run a routing node              "slashrouter run"
    - set : Set a value for a given KeyPair "slashrouter set <seed (utf8)>"
    - get : Get a value for a public Key    "slashrouter get <key (hex)>"
    `)
}

async function run () {
  const DEFAULT_STORAGE = './.slashrouter-storage '
  // TODO: store data at os.home
  const node = new DHT({ storage: DEFAULT_STORAGE })
  await node.ready().catch()
  console.log('Node bound to', node.address())
  console.log('Storage at', DEFAULT_STORAGE)

  node.on('persistent', function () {
    console.log('Node seems stable, joining remote routing tables')
  })
}

async function put () {
  const seed = Buffer.alloc(32).fill(process.argv[3])
  const urls = process.argv.slice(4)

  const dht = new DHT({ seed })

  const response = await dht.put(urls)

  if (response) {
    console.log('Saved a record for ', response.publicKey.toString('hex'))
  }

  dht.destroy()
}

async function get () {
  const key = Buffer.from(process.argv[3], 'hex')
  const dht = new DHT()
  await dht.ready()

  const response = await dht.get(key)
  if (response.value) { console.log('Resolved record for', process.argv[3], '\n', response.value) }

  dht.destroy()
}
