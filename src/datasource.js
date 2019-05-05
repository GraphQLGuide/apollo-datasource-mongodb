import { DataSource } from 'apollo-datasource'
import { ApolloError } from 'apollo-server-errors'
import { InMemoryLRUCache } from 'apollo-server-caching'

import { createCachingMethods } from './cache'

class MongoDataSource extends DataSource {
  constructor(collections) {
    super()

    const setUpCorrectly = typeof collections === 'object'
    if (!setUpCorrectly) {
      throw new ApolloError(
        'MongoDataSource constructor must be given an object with collection(s)'
      )
    }

    this.collections = collections
  }

  // https://github.com/apollographql/apollo-server/blob/master/packages/apollo-datasource/src/index.ts
  initialize(config) {
    this.context = config.context

    const cache = config.cache || new InMemoryLRUCache()

    for (const key in this.collections) {
      this[key] = createCachingMethods({
        collection: this.collections[key],
        cache
      })
    }
  }
}

export { MongoDataSource }
