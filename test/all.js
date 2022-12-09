import test from 'brittle'
import b4a from 'b4a'

import createTestnet from './helpers/testnet.js'

test.solo('see', async (t) => {
  const testnet = await createTestnet(10, t.teardown)

  const node = testnet.nodes[testnet.nodes.length-1]
  await node.put("https://www.cdtilda.com")

  const client = testnet.nodes[3] 
  const response = await client.get(node.defaultKeyPair.publicKey)
  t.ok(response)
})

