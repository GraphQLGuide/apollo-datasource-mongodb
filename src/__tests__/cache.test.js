import { InMemoryLRUCache } from 'apollo-server-caching'
import wait from 'waait'
import { ObjectId } from 'mongodb'
import { EJSON } from 'bson'

import { createCachingMethods, idToString } from '../cache'

const hexId = 'aaaa0000bbbb0000cccc0000'

const docs = {
  one: {
    _id: ObjectId(hexId)
  },
  two: {
    _id: ObjectId()
  }
}

const stringDoc = {
  _id: 's2QBCnv6fXv5YbjAP'
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
                  ids.map(id => {
                    if (id === stringDoc._id) {
                      return stringDoc
                    }

                    if (id.equals(docs.one._id)) {
                      return docs.one
                    }

                    if (id.equals(docs.two._id)) {
                      return docs.two
                    }
                  })
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
    const doc = await api.findOneById(docs.one._id)
    expect(doc).toBe(docs.one)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds one with string id', async () => {
    const doc = await api.findOneById(stringDoc._id)
    expect(doc).toBe(stringDoc)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds two with batching', async () => {
    const foundDocs = await api.findManyByIds([docs.one._id, docs.two._id])

    expect(foundDocs[0]).toBe(docs.one)
    expect(foundDocs[1]).toBe(docs.two)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`doesn't cache without ttl`, async () => {
    await api.findOneById(docs.one._id)

    const value = await cache.get(cacheKey(docs.one._id))
    expect(value).toBeUndefined()
  })

  it(`caches`, async () => {
    await api.findOneById(docs.one._id, { ttl: 1 })
    const value = await cache.get(cacheKey(docs.one._id))
    expect(value).toEqual(EJSON.stringify(docs.one))

    await api.findOneById(docs.one._id)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`caches with ttl`, async () => {
    await api.findOneById(docs.one._id, { ttl: 1 })
    await wait(1001)

    const value = await cache.get(cacheKey(docs.one._id))
    expect(value).toBeUndefined()
  })

  it(`deletes from cache`, async () => {
    for (const doc of [docs.one, docs.two, stringDoc]) {
      await api.findOneById(doc._id, { ttl: 1 })

      const valueBefore = await cache.get(cacheKey(doc._id))
      expect(valueBefore).toEqual(EJSON.stringify(doc))

      await api.deleteFromCacheById(doc._id)

      const valueAfter = await cache.get(cacheKey(doc._id))
      expect(valueAfter).toBeUndefined()
    }
  })

  it('deletes from DataLoader cache', async () => {
    for (const id of [docs.one._id, docs.two._id, stringDoc._id]) {
      await api.findOneById(id)
      expect(collection.find).toHaveBeenCalled()
      collection.find.mockClear()

      await api.findOneById(id)
      expect(collection.find).not.toHaveBeenCalled()

      await api.deleteFromCacheById(id)
      await api.findOneById(id)
      expect(collection.find).toHaveBeenCalled()
    }
  })
})
