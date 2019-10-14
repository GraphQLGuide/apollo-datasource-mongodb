import DataLoader from 'dataloader'

const remapDocs = (docs, ids) => {
  const idMap = {}
  docs.forEach(doc => {
    idMap[doc._id] = doc
  })
  return ids.map(id => idMap[id])
}

export const createCachingMethods = ({ collection, cache }) => {
  const isMongoose = typeof collection === 'function'

  const loader = new DataLoader(ids =>
    isMongoose
      ? collection
          .find({ _id: { $in: ids } })
          .lean()
          .then(docs => remapDocs(docs, ids))
      : collection
          .find({ _id: { $in: ids } })
          .toArray()
          .then(docs => remapDocs(docs, ids))
  )

  const cachePrefix = `mongo-${collection.collectionName}-`

  const methods = {
    findOneById: async (id, { ttl } = {}) => {
      const key = cachePrefix + id

      const cacheDoc = await cache.get(key)
      if (cacheDoc) {
        return cacheDoc
      }

      const doc = await loader.load(id)
      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, doc, { ttl })
      }

      return doc
    },
    findManyByIds: (ids, { ttl } = {}) => {
      return Promise.all(ids.map(id => methods.findOneById(id, { ttl })))
    },
    deleteFromCacheById: id => cache.delete(cachePrefix + id)
  }

  return methods
}
