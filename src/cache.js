import DataLoader from 'dataloader'

import { getCollection, isModel } from './helpers'

// https://github.com/graphql/dataloader#batch-function
const orderDocs = ids => docs => {
  const idMap = {}
  docs.forEach(doc => {
    idMap[doc._id] = doc
  })
  return ids.map(id => idMap[id])
}

export const createCachingMethods = ({ collection, cache }) => {
  const loader = new DataLoader((ids) => {
    const res = collection.find({
      _id: {
        $in: ids,
      },
    });

    let promise;

    if (isModel(collection)) {
      promise = res.exec();
    } else {
      promise = res.toArray();
    }

    return promise.then(orderDocs(ids));
  });

  const cachePrefix = `mongo-${getCollection(collection).collectionName}-`

  const methods = {
    findOneById: async (id, { ttl } = {}) => {
      const key = cachePrefix + id

      const cacheDoc = await cache.get(key)
      if (cacheDoc) {
        return JSON.parse(cacheDoc)
      }

      const doc = await loader.load(id)
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
      loader.clear(id)
      await cache.delete(cachePrefix + id)
    }
  }

  return methods
}
