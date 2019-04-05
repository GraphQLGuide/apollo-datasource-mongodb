import { DataSource } from 'apollo-datasource'
import { ApolloError } from 'apollo-server-errors'
import { InMemoryLRUCache } from 'apollo-server-caching'

import { setupCaching } from './cache'

class MongoDataSource extends DataSource {
  // https://github.com/apollographql/apollo-server/blob/master/packages/apollo-datasource/src/index.ts
  initialize(config) {
    this.context = config.context

    if (!this.collections || !this.collections.length) {
      throw new ApolloError(
        'Child class of MongoDataSource must set this.collections in constructor'
      )
    }

    const cache = config.cache || new InMemoryLRUCache()

    this.collections.forEach(collection => setupCaching({ collection, cache }))
  }
}

export { MongoDataSource }
