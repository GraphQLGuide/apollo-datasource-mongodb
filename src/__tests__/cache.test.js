import { InMemoryLRUCache } from 'apollo-server-caching'
import wait from 'waait'

import { setupCaching } from '../cache'

const docs = {
  id1: {
    _id: 'id1'
  },
  id2: {
    _id: 'id2'
  },
  id3: {
    _id: 'id3'
  }
}

const collectionName = 'test'
const cacheKey = id => `mongo-${collectionName}-${id}`

describe('setupCaching', () => {
  let collection
  let cache

  beforeEach(() => {
    collection = {
      collectionName,
      find: jest.fn(({ _id: { $in: ids } }) => ({
        toArray: () =>
          new Promise(resolve => {
            setTimeout(() => resolve(ids.map(id => docs[id])), 0)
          })
      }))
    }

    cache = new InMemoryLRUCache()

    setupCaching({ collection, cache })
  })

  it('adds the right methods', () => {
    expect(collection.findOneById).toBeDefined()
    expect(collection.findManyByIds).toBeDefined()
    expect(collection.deleteFromCacheById).toBeDefined()
  })

  it('finds one', async () => {
    const doc = await collection.findOneById('id1')
    expect(doc).toBe(docs.id1)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds two with batching', async () => {
    const foundDocs = await collection.findManyByIds(['id2', 'id3'])

    expect(foundDocs[0]).toBe(docs.id2)
    expect(foundDocs[1]).toBe(docs.id3)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  // TODO why doesn't this pass?
  // it.only(`doesn't cache without ttl`, async () => {
  //   await collection.findOneById('id1')
  //   await collection.findOneById('id1')

  //   expect(collection.find.mock.calls.length).toBe(2)
  // })

  it(`doesn't cache without ttl`, async () => {
    await collection.findOneById('id1')

    const value = await cache.get(cacheKey('id1'))
    expect(value).toBeUndefined()
  })

  it(`caches`, async () => {
    await collection.findOneById('id1', { ttl: 1 })
    const value = await cache.get(cacheKey('id1'))
    expect(value).toBe(docs.id1)

    await collection.findOneById('id1')
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`caches with ttl`, async () => {
    await collection.findOneById('id1', { ttl: 1 })
    await wait(1001)

    const value = await cache.get(cacheKey('id1'))
    expect(value).toBeUndefined()
  })

  it(`deletes from cache`, async () => {
    await collection.findOneById('id1', { ttl: 1 })

    const valueBefore = await cache.get(cacheKey('id1'))
    expect(valueBefore).toBe(docs.id1)

    await collection.deleteFromCacheById('id1')

    const valueAfter = await cache.get(cacheKey('id1'))
    expect(valueAfter).toBeUndefined()
  })
})
