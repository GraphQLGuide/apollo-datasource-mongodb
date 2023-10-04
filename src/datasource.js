import { GraphQLError } from 'graphql'
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache'

import { createCachingMethods } from './cache'
import { isCollectionOrModel, isModel } from './helpers'


class MongoDataSource {
  constructor({modelOrCollection, cache}) {
    if (!isCollectionOrModel(modelOrCollection)) {
      throw new GraphQLError(
        'MongoDataSource constructor must be given a collection or Mongoose model'
      )
    }

    if (isModel(modelOrCollection)) {
      this.model = modelOrCollection
      this.collection = this.model.collection
    } else {
      this.collection = modelOrCollection
    }

    const methods = createCachingMethods({
      collection: this.collection,
      model: this.model,
      cache: cache || new InMemoryLRUCache()
    })

    Object.assign(this, methods)
  }
}

export { MongoDataSource }
