import { MongoClient, ObjectId } from 'mongodb'
import mongoose, { Schema, model } from 'mongoose'
import { describe, it, expect, test } from '@jest/globals'

import { MongoDataSource } from '../datasource'
import { isModel, isCollectionOrModel, getCollection, log } from '../helpers'

class Users extends MongoDataSource {
  constructor(options) {
    super(options)
    this.context = options.context
  }
}

describe('MongoDataSource', () => {
  it('sets up caching functions', () => {
    const users = {}
    const source = new Users({ modelOrCollection: users })

    expect(source.findOneById).toBeDefined()
    expect(source.findByFields).toBeDefined()
    expect(source.deleteFromCacheById).toBeDefined()
    expect(source.deleteFromCacheByFields).toBeDefined()
    expect(source.collection).toEqual(users)
  })
})

const URL = 'mongodb://localhost:27017/test-apollo-datasource'

const connect = async () => {
  const client = new MongoClient(URL)
  await mongoose.connect(URL)
  await client.connect()
  return client.db()
}

const hexId = '5cf82e14a220a607eb64a7d4'
const objectID = new ObjectId(hexId)

describe('Mongoose', () => {
  let UserModel
  let userCollection
  let alice

  beforeAll(async () => {
    const userSchema = new Schema({ name: 'string' }, { id: true })
    UserModel = model('User', userSchema)

    const db = await connect()
    userCollection = db.collection('users')
    alice = await UserModel.findOneAndUpdate(
      { name: 'Alice' },
      { name: 'Alice' },
      { upsert: true, new: true }
    )

    await userCollection.findOneAndReplace(
      { name: 'Bob' },
      { name: 'Bob', nested: { _id: objectID, field1: 'value1', field2: '' } },
      { new: true, upsert: true }
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
    const users = new Users({ modelOrCollection: UserModel })
    const user = await users.findOneById(alice._id)

    expect(user.name).toBe('Alice')
    // Without lean it should return getters
    expect(user.id).toBe(alice._id.toString())
  })

  test('Data Source with Model lean', async () => {
    const users = new Users({
      modelOrCollection: UserModel,
      options: { lean: true }
    })
    const user = await users.findOneById(alice._id)

    expect(user.name).toBe('Alice')
    // With lean it shouldn't return getters
    expect(user.id).toBeUndefined()
  })

  test('Data Source with Collection', async () => {
    const users = new Users({ modelOrCollection: userCollection })
    const user = await users.findOneById(alice._id)

    expect(user.name).toBe('Alice')
  })

  test('nested findByFields', async () => {
    const users = new Users({ modelOrCollection: userCollection })
    const [user] = await users.findByFields({ 'nested._id': objectID })

    expect(user).toBeDefined()
    expect(user.name).toBe('Bob')

    const res1 = await users.findByFields({ 'nested.field1': 'value1' })
    const res2 = await users.findByFields({ 'nested.field2': 'value1' })

    expect(res1[0].name).toBe('Bob')
    expect(res2[0]).toBeUndefined()
  })

  test('Data Source with Context', async () => {
    const users = new Users({
      modelOrCollection: UserModel,
      context: { token: '123' }
    })

    expect(users.context.token).toBe('123')
  })

  test('Data Source with Context that contains a User', async () => {
    const users = new Users({
      modelOrCollection: userCollection,
      context: { user: alice }
    })
    const user = await users.findOneById(alice._id)

    expect(user.name).toBe('Alice')
    expect(users.context.user.name).toBe(user.name)
  })
})
