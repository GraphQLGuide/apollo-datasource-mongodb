import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache'
import wait from 'waait'
import { ObjectId } from 'mongodb'
import { EJSON } from 'bson'

import {
  createCachingMethods,
  idToString,
  isValidObjectIdString,
  prepFields,
  getNestedValue
} from '../cache'

import { log } from '../helpers'

const hexId = '5cf82e14a220a607eb64a7d4'
const objectID = new ObjectId(hexId)

const docs = {
  one: {
    _id: objectID,
    foo: 'bar',
    tags: ['foo', 'bar']
  },
  two: {
    _id: new ObjectId(),
    foo: 'bar'
  },
  three: {
    nested: {
      _id: objectID
    }
  }
}

const stringDoc = {
  _id: 's2QBCnv6fXv5YbjAP',
  tags: ['bar', 'baz']
}

const collectionName = 'test'
const cacheKeyById = id => `mongo-${collectionName}-${idToString(id)}`
const cacheKeyByFields = fields => {
  const { loaderKey } = prepFields(fields)

  return `mongo-${collectionName}-${loaderKey}`
}

describe('createCachingMethods', () => {
  let collection
  let api
  let cache

  beforeEach(() => {
    collection = {
      collectionName,
      find: jest.fn(filter => {
        return {
          toArray: () =>
            new Promise(resolve => {
              setTimeout(
                () =>
                  resolve(
                    [docs.one, docs.two, stringDoc].filter(doc => {
                      for (const orFilter of filter.$or || [filter]) {
                        for (const field in orFilter) {
                          if (field === '_id') {
                            for (const id of orFilter._id.$in) {
                              if (id.equals && !id.equals(doc._id)) {
                                break
                              } else if (
                                doc._id.equals &&
                                !doc._id.equals(id)
                              ) {
                                break
                              } else if (
                                !id.equals &&
                                !doc._id.equals &&
                                id !== doc._id
                              ) {
                                break
                              }
                            }
                          } else if (Array.isArray(doc[field])) {
                            for (const value of orFilter[field].$in) {
                              if (!doc[field].includes(value)) {
                                break
                              }
                            }
                          } else if (
                            !orFilter[field].$in.includes(doc[field])
                          ) {
                            break
                          }
                        }
                        return true
                      }
                      return false
                    })
                  ),
                0
              )
            })
        }
      })
    }

    cache = new InMemoryLRUCache()

    api = createCachingMethods({ collection, cache })
  })

  it('adds the right methods', () => {
    expect(api.findOneById).toBeDefined()
    expect(api.findManyByIds).toBeDefined()
    expect(api.deleteFromCacheById).toBeDefined()

    expect(api.findByFields).toBeDefined()
    expect(api.deleteFromCacheByFields).toBeDefined()
  })

  it('finds one with ObjectId', async () => {
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

  it(`memoizes with Dataloader`, async () => {
    await api.findOneById(docs.one._id)
    await api.findOneById(docs.one._id)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds by field', async () => {
    const foundDocs = await api.findByFields({ foo: 'bar' })

    expect(foundDocs[0]).toBe(docs.one)
    expect(foundDocs[1]).toBe(docs.two)
    expect(foundDocs.length).toBe(2)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds by ObjectID field', async () => {
    const foundDocs = await api.findByFields({ _id: objectID })

    expect(foundDocs[0]).toBe(docs.one)
    expect(foundDocs.length).toBe(1)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  // See datasource.test.js, where we test against a database instance
  // (so we don't have to update our already-complex collection.find mock)
  //
  // it('finds by nested ObjectID field', async () => {
  //   const foundDocs = await api.findByFields({ 'nested._id': objectID })
  //   expect(foundDocs[0]).toBe(docs.three)
  //   expect(foundDocs.length).toBe(1)
  //   expect(collection.find.mock.calls.length).toBe(1)
  // })

  it('finds by array field', async () => {
    const foundDocs = await api.findByFields({ tags: 'bar' })

    expect(foundDocs[0]).toBe(docs.one)
    expect(foundDocs[1]).toBe(stringDoc)
    expect(foundDocs.length).toBe(2)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds by multiple fields', async () => {
    const foundDocs = await api.findByFields({
      tags: ['foo', 'bar'],
      foo: 'bar'
    })

    expect(foundDocs[0]).toBe(docs.one)
    expect(foundDocs.length).toBe(1)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`doesn't mix filters of pending calls for different fields`, async () => {
    const pendingDocs1 = api.findByFields({ foo: 'bar' })
    const pendingDocs2 = api.findByFields({ tags: 'baz' })
    const [foundDocs1, foundDocs2] = await Promise.all([
      pendingDocs1,
      pendingDocs2
    ])

    expect(foundDocs1[0]).toBe(docs.one)
    expect(foundDocs1[1]).toBe(docs.two)
    expect(foundDocs1.length).toBe(2)
    expect(foundDocs2[0]).toBe(stringDoc)
    expect(foundDocs2.length).toBe(1)

    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`dataloader caches each value individually when finding by a single field`, async () => {
    await api.findByFields({ tags: ['foo', 'baz'] }, { ttl: 1 })

    const fooBazCacheValue = await cache.get(
      cacheKeyByFields({ tags: ['foo', 'baz'] })
    )
    const fooCacheValue = await cache.get(cacheKeyByFields({ tags: 'foo' }))

    expect(fooBazCacheValue).toBeDefined()
    expect(fooCacheValue).toBeUndefined()

    await api.findByFields({ tags: 'foo' })
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`doesn't cache without ttl`, async () => {
    await api.findOneById(docs.one._id)

    const value = await cache.get(cacheKeyById(docs.one._id))
    expect(value).toBeUndefined()
  })

  it(`caches by ID`, async () => {
    await api.findOneById(docs.one._id, { ttl: 1 })
    const value = await cache.get(cacheKeyById(docs.one._id))
    expect(value).toEqual(EJSON.stringify(docs.one))

    await api.findOneById(docs.one._id)
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`caches non-array field values as arrays`, async () => {
    const fields = { tags: 'foo' }
    await api.findByFields(fields, { ttl: 1 })
    const value = await cache.get(cacheKeyByFields(fields))
    expect(value).toEqual(EJSON.stringify([docs.one]))

    await api.findByFields({ tags: ['foo'] })
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`caches ID with ttl`, async () => {
    await api.findOneById(docs.one._id, { ttl: 1 })
    await wait(1001)

    const value = await cache.get(cacheKeyById(docs.one._id))
    expect(value).toBeUndefined()
  })

  it(`deletes from cache by ID`, async () => {
    for (const doc of [docs.one, docs.two, stringDoc]) {
      await api.findOneById(doc._id, { ttl: 1 })

      const valueBefore = await cache.get(cacheKeyById(doc._id))
      expect(valueBefore).toEqual(EJSON.stringify(doc))

      await api.deleteFromCacheById(doc._id)

      const valueAfter = await cache.get(cacheKeyById(doc._id))
      expect(valueAfter).toBeUndefined()
    }
  })

  it('deletes from DataLoader cache by ID', async () => {
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

  it(`deletes from cache by fields`, async () => {
    const fields = { foo: 'bar' }
    await api.findByFields(fields, { ttl: 1 })

    const valueBefore = await cache.get(cacheKeyByFields(fields))
    expect(valueBefore).toEqual(EJSON.stringify([docs.one, docs.two]))

    await api.deleteFromCacheByFields(fields)

    const valueAfter = await cache.get(cacheKeyByFields(fields))
    expect(valueAfter).toBeUndefined()
  })
})

describe('isValidObjectIdString', () => {
  it('works', () => {
    const trickyId = 'toptoptoptop'
    expect(ObjectId.isValid(trickyId)).toBe(true)
    expect(isValidObjectIdString(trickyId)).toBe(false)
    expect(isValidObjectIdString(hexId)).toBe(true)
  })
})

describe('getNestedValue', () => {
  it('works', () => {
    const obj = {
      nested: { foo: 'bar', fooB: '', fooC: null, fooE: { inner: true } }
    }
    expect(getNestedValue(obj, 'nested.foo')).toEqual('bar')
    expect(getNestedValue(obj, 'nested.fooB')).toEqual('')
    expect(getNestedValue(obj, 'nested.fooC')).toEqual(null)
    expect(getNestedValue(obj, 'nested.fooD')).toBeUndefined()
    expect(getNestedValue(obj, 'nested.fooE.inner')).toBe(true)
  })
})
