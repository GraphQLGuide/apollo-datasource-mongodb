import { MongoClient } from 'mongodb'
import mongoose, { Schema, model } from 'mongoose'

import { MongoDataSource } from '../datasource'
import { isModel, isCollectionOrModel, getCollection } from '../helpers'

mongoose.set('useFindAndModify', false)

class Users extends MongoDataSource {
  initialize(config) {
    super.initialize(config)
  }
}

describe('MongoDataSource', () => {
  it('sets up caching functions', () => {
    const users = {}
    const source = new Users(users)
    source.initialize()
    expect(source.findOneById).toBeDefined()
    expect(source.collection).toEqual(users)
  })
})

const URL = 'mongodb://localhost:27017/test'
const connectArgs = [
  URL,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
]

const connect = async () => {
  const client = new MongoClient(...connectArgs)
  await mongoose.connect(...connectArgs)
  await client.connect()
  return client.db()
}

describe('Mongoose', () => {
  let UserModel
  let userCollection
  let alice

  beforeAll(async () => {
    const userSchema = new Schema({ name: 'string' })
    UserModel = model('User', userSchema)

    const db = await connect()
    userCollection = db.collection('users')
    alice = await UserModel.findOneAndUpdate(
      { name: 'Alice' },
      { name: 'Alice' },
      { upsert: true, new: true }
    )
  })

  test('isCollectionOrModel', () => {
    expect(isCollectionOrModel(userCollection)).toBe(true)
    expect(isCollectionOrModel(UserModel)).toBe(true)
    expect(isCollectionOrModel(Function.prototype)).toBe(false)
    expect(isCollectionOrModel(undefined)).toBe(false)
  })

  test('isModel', () => {
    expect(isModel(userCollection)).toBe(false)
    expect(isModel(UserModel)).toBe(true)
    expect(isCollectionOrModel(Function.prototype)).toBe(false)
    expect(isCollectionOrModel(undefined)).toBe(false)
  })

  test('mongoose class-based components', () => {
    /**
     * @see https://github.com/GraphQLGuide/apollo-datasource-mongodb/issues/51
     */

    const ClassModel = mongoose.model(
      class ClassModel extends mongoose.Model {},
      new Schema({ name: 'string' })
    )

    expect(isModel(ClassModel)).toBe(true)
    expect(isCollectionOrModel(ClassModel)).toBe(true)
  })

  test('getCollectionName', () => {
    expect(getCollection(userCollection).collectionName).toBe('users')
    expect(getCollection(UserModel).collectionName).toBe('users')
  })

  test('Data Source with Model', async () => {
    const users = new Users(UserModel)
    users.initialize()
    const user = await users.findOneById(alice._id)
    expect(user.name).toBe('Alice')
    expect(user.id).toBe(alice._id.toString())
  })

  test('Data Source with Collection', async () => {
    const users = new Users(userCollection)
    users.initialize()
    const user = await users.findOneById(alice._id)
    expect(user.name).toBe('Alice')
    expect(user.id).toBeUndefined()
  })
})
