// @ts-nocheck
import test from 'brittle'

import Cache from '../lib/cache.js'

test('cache - eject oldest records', (t) => {
  const cache = new Cache(3)

  cache.set('foo4', 4)
  cache.set('foo3', 3)
  cache.set('foo2', 2)
  cache.set('foo1', 1)

  t.absent(cache.get('foo4'))
  t.is(cache.get('foo3'), 3)
})
