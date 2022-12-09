import test from 'brittle'
// @ts-ignore
import os from 'os'

import createTestnet from './helpers/testnet.js'

test('basic', async (t) => {
  const testnet = await createTestnet(10, t.teardown)

  const node = testnet.nodes[testnet.nodes.length - 1]
  await node.put('www.example.com')

  const client = testnet.nodes[3]
  const record = await client.get(node.key)
  t.ok(record)
  t.alike(record.value, ['www.example.com'])
})

test('storage', async (t) => {
  let key
  const storage = tmpdir()

  {
    const testnet = await createTestnet(30, { storage })

    const node = testnet.nodes[testnet.nodes.length - 1]
    await node.put('www.example.com')
    key = node.key

    const client = testnet.nodes[3]
    const record = await client.get(node.key)
    t.ok(record)
    t.alike(record.value, ['www.example.com'])

    testnet.destroy()
  }

  {
    const testnet = await createTestnet(30, { storage })

    const client = testnet.nodes[6]
    const record = await client.get(key)
    t.ok(record)
    t.alike(record.value, ['www.example.com'])

    testnet.destroy()
  }
})

function tmpdir () {
  return os.tmpdir() + '/' + Math.random().toString(16).slice(2)
}
