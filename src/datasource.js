import { DataSource } from 'apollo-datasource'
import { ApolloError } from 'apollo-server-errors'
import { InMemoryLRUCache } from 'apollo-server-caching'

import { createCachingMethods } from './cache'

class MongoDataSource extends DataSource {
  constructor(collection) {
    super()

    const setUpCorrectly =
      typeof collection === 'object' && Object.keys(collection).length === 1
    if (!setUpCorrectly) {
      throw new ApolloError(
        'MongoDataSource constructor must be given an object with a single collection'
      )
    }

    this.collectionName = Object.keys(collection)[0]
    this[this.collectionName] = collection[this.collectionName]
  }

  // https://github.com/apollographql/apollo-server/blob/master/packages/apollo-datasource/src/index.ts
  initialize(config) {
    this.context = config.context

    const cache = config.cache || new InMemoryLRUCache()

    const methods = createCachingMethods({
      collection: this[this.collectionName],
      cache
    })
    Object.assign(this, methods)
  }
}

export { MongoDataSource }
