import DataLoader from 'dataloader'

import { getCollection, isModel } from './helpers'
import { ObjectId } from 'bson'
// https://github.com/graphql/dataloader#batch-function
const orderDocs = ids => docs => {
  const idMap = {}
  docs.forEach(doc => {
    idMap[doc._id] = doc
  })
  return ids.map(id => idMap[id])
}

export const createCachingMethods = ({ collection, model, cache }) => {
  const loader = new DataLoader(ids => {
    const filter = {
      _id: {
        $in: ids
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
      const _id = id instanceof ObjectId ? id.toHexString() : id
      const key = cachePrefix + _id

      const cacheDoc = await cache.get(key)
      if (cacheDoc) {
        return JSON.parse(cacheDoc)
      }

      const doc = await loader.load(_id)
      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, JSON.stringify(doc), { ttl })
      }

      return doc
    },
    findManyByIds: (ids, { ttl } = {}) => {
      return Promise.all(ids.map(id => methods.findOneById(id, { ttl })))
    },
    deleteFromCacheById: async id => {
      const _id = id instanceof ObjectId ? id.toHexString() : id
      loader.clear(_id)
      await cache.delete(cachePrefix + _id)
    }
  }

  return methods
}
