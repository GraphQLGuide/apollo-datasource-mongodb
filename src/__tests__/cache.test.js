import { InMemoryLRUCache } from 'apollo-server-caching'
import wait from 'waait'
import { ObjectId } from 'mongodb'
import { EJSON } from 'bson'

import { createCachingMethods, idToString } from '../cache'

const docs = {
  id1: {
    _id: 'id1'
    // _id: ObjectId()
  },
  id2: {
    _id: ObjectId()
  }
}

const collectionName = 'test'
const cacheKey = id => `mongo-${collectionName}-${idToString(id)}`

describe('createCachingMethods', () => {
  let collection
  let api
  let cache

  beforeEach(() => {
    collection = {
      collectionName,
      find: jest.fn(({ _id: { $in: ids } }) => ({
        toArray: () =>
          new Promise(resolve => {
            setTimeout(
              () =>
                resolve(
                  ids.map(id => (id === docs.id1._id ? docs.id1 : docs.id2))
                ),
              0
            )
          })
      }))
    }

    cache = new InMemoryLRUCache()

    api = createCachingMethods({ collection, cache })
  })

  it('adds the right methods', () => {
    expect(api.findOneById).toBeDefined()
    expect(api.findManyByIds).toBeDefined()
    expect(api.deleteFromCacheById).toBeDefined()
  })

  it('finds one', async () => {
    const doc = await api.findOneById(docs.id1._id)
    expect(doc).toBe(docs.id1)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds two with batching', async () => {
    const foundDocs = await api.findManyByIds([docs.id1._id, docs.id2._id])

    expect(foundDocs[0]).toBe(docs.id1)
    expect(foundDocs[1]).toBe(docs.id2)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  // TODO why doesn't this pass?
  // it.only(`doesn't cache without ttl`, async () => {
  //   await api.findOneById(docs.id1._id)
  //   await api.findOneById(docs.id1._id)

  //   expect(collection.find.mock.calls.length).toBe(2)
  // })

  it(`doesn't cache without ttl`, async () => {
    await api.findOneById(docs.id1._id)

    const value = await cache.get(cacheKey(docs.id1._id))
    expect(value).toBeUndefined()
  })

  it(`caches`, async () => {
    await api.findOneById(docs.id1._id, { ttl: 1 })
    const value = await cache.get(cacheKey(docs.id1._id))
    expect(value).toEqual(EJSON.stringify(docs.id1))

    await api.findOneById(docs.id1._id)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`caches with ttl`, async () => {
    await api.findOneById(docs.id1._id, { ttl: 1 })
    await wait(1001)

    const value = await cache.get(cacheKey(docs.id1._id))
    expect(value).toBeUndefined()
  })

  it(`deletes from cache`, async () => {
    await api.findOneById(docs.id1._id, { ttl: 1 })

    const valueBefore = await cache.get(cacheKey(docs.id1._id))
    expect(valueBefore).toEqual(EJSON.stringify(docs.id1))

    await api.deleteFromCacheById(docs.id1._id)

    const valueAfter = await cache.get(cacheKey(docs.id1._id))
    expect(valueAfter).toBeUndefined()
  })
})
