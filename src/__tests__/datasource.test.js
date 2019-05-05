import { MongoDataSource } from '../datasource'

const users = {}
const posts = {}

class MyMongo extends MongoDataSource {
  initialize(config) {
    super.initialize(config)
  }
}

describe('MongoDataSource', () => {
  it('sets up caching functions', () => {
    const source = new MyMongo({ users, posts })
    source.initialize({})
    expect(source.users.findOneById).toBeDefined()
    expect(source.posts.findOneById).toBeDefined()
  })
})
