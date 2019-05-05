import { MongoDataSource } from '../datasource'

const users = {}

class Users extends MongoDataSource {
  initialize(config) {
    super.initialize(config)
  }
}

describe('MongoDataSource', () => {
  it('sets up caching functions', () => {
    const source = new Users({ users })
    source.initialize({})
    expect(source.findOneById).toBeDefined()
    expect(source.users).toEqual(users)
  })
})
