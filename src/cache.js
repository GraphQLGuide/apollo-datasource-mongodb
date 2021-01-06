import DataLoader from 'dataloader'
import { ObjectId } from 'mongodb'
import { EJSON } from 'bson'

import { getCollection } from './helpers'

export const idToString = id => (id instanceof ObjectId ? id.toHexString() : id)
const stringToId = str => {
  if (str instanceof ObjectId) {
    return str
  }

  if (ObjectId.isValid(str)) {
    return new ObjectId(str)
  }

  return str
}

// https://github.com/graphql/dataloader#batch-function
const orderDocs = ids => docs => {
  const idMap = {}
  docs.forEach(doc => {
    idMap[idToString(doc._id)] = doc
  })
  return ids.map(id => idMap[idToString(id)])
}

export const createCachingMethods = ({ collection, model, cache }) => {
  const loader = new DataLoader(ids => {
    const filter = {
      _id: {
        $in: ids.map(stringToId)
      }
    }
    const promise = model
      ? model.find(filter).exec()
      : collection.find(filter).toArray()

    return promise.then(orderDocs(ids))
  })

  const cachePrefix = `mongo-${getCollection(collection).collectionName}-`

  const methods = {
    findOneById: async (id, { ttl } = {}) => {
      const key = cachePrefix + idToString(id)

      const cacheDoc = await cache.get(key)
      if (cacheDoc) {
        return EJSON.parse(cacheDoc)
      }

      const doc = await loader.load(idToString(id))
      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, EJSON.stringify(doc), { ttl })
      }

      return doc
    },
    findManyByIds: (ids, { ttl } = {}) => {
      return Promise.all(ids.map(id => methods.findOneById(id, { ttl })))
    },
    deleteFromCacheById: async id => {
      const stringId = idToString(id)
      loader.clear(stringId)
      await cache.delete(cachePrefix + stringId)
    }
  }

  return methods
}
