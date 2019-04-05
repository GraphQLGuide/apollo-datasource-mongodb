import { MongoDataSource } from '../datasource'

const users = {}
const posts = {}

class MyMongo extends MongoDataSource {
  constructor() {
    super()
    this.collections = [users, posts]
  }
}

describe('MongoDataSource', () => {
  it('sets up caching functions', () => {
    const source = new MyMongo()
    source.initialize({})
    expect(users.findOneById).toBeDefined()
    expect(posts.findOneById).toBeDefined()
  })
})
