import { DataSource } from 'apollo-datasource'
import { ApolloError } from 'apollo-server-errors'
import { InMemoryLRUCache } from 'apollo-server-caching'

import { createCachingMethods } from './cache'

class MongoDataSource extends DataSource {
  // https://github.com/apollographql/apollo-server/blob/master/packages/apollo-datasource/src/index.ts
  initialize(config) {
    this.context = config.context

    const setUpCorrectly =
      typeof this.collections === 'object' || this.collection
    if (!setUpCorrectly) {
      throw new ApolloError(
        'Child class of MongoDataSource must set this.collections or this.collection in constructor'
      )
    }

    const cache = config.cache || new InMemoryLRUCache()

    if (this.collections) {
      for (const key in this.collections) {
        this[key] = createCachingMethods({
          collection: this.collections[key],
          cache
        })
      }
    } else {
      const methods = createCachingMethods({
        collection: this.collection,
        cache
      })
      Object.assign(this, methods)
    }
  }
}

export { MongoDataSource }
