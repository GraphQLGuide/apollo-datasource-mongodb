import { MongoDataSource } from '../datasource'

const users = {}
const posts = {}

class MyMongo extends MongoDataSource {
  constructor() {
    super()
    this.collections = { users, posts }
  }

  initialize(config) {
    super.initialize(config)
  }
}

class SingleCollection extends MongoDataSource {
  constructor() {
    super()
    this.collection = users
  }
}

describe('MongoDataSource', () => {
  it('sets up caching functions', () => {
    const source = new MyMongo()
    source.initialize({})
    expect(source.users.findOneById).toBeDefined()
    expect(source.posts.findOneById).toBeDefined()
  })

  it('sets up caching functions for single collection', () => {
    const source = new SingleCollection()
    source.initialize({})
    expect(source.findOneById).toBeDefined()
  })
})
