import { MongoClient, ObjectId } from 'mongodb'
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
    expect(source.findByFields).toBeDefined()
    expect(source.deleteFromCacheById).toBeDefined()
    expect(source.deleteFromCacheByFields).toBeDefined()
    expect(source.collection).toEqual(users)
  })
})

const URL = 'mongodb://localhost:27017/test-apollo-datasource'
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

const hexId = '5cf82e14a220a607eb64a7d4'
const objectID = ObjectId(hexId)

describe('Mongoose', () => {
  let UserModel
  let userCollection
  let alice
  let nestedBob
  let nestedCharlie
  let nestedDan

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

    nestedBob = await userCollection.findOneAndReplace(
      { name: 'Bob' },
      {
        name: 'Bob',
        nested: { _id: objectID, field1: 'value1', field2: 'value1' }
      },
      { new: true, upsert: true }
    )

    nestedCharlie = await userCollection.findOneAndReplace(
      { name: 'Charlie' },
      {
        name: 'Charlie',
        nested: { field1: 'value2', field2: 'value2' }
      },
      { new: true, upsert: true }
    )

    nestedDan = await userCollection.findOneAndReplace(
      { name: 'Dan' },
      {
        name: 'Dan',
        nested: { field1: 'value1', field2: 'value2' }
      },
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

  test('nested findByFields', async () => {
    const users = new Users(userCollection)
    users.initialize()

    const [user] = await users.findByFields({ 'nested._id': objectID })

    expect(user).toBeDefined()
    expect(user.name).toBe('Bob')

    const res1 = await users.findByFields({ 'nested.field1': 'value1' })
    const res2 = await users.findByFields({ 'nested.field2': '' })
    expect(res1[0].name).toBe('Bob')
    expect(res2[0]).toBeUndefined()
  })

  test('nested findByFields with single filter and batching', async () => {
    const users = new Users(userCollection)
    users.initialize()

    let pendingDocs = []
    for (var i = 1; i <= 3; i++) {
      pendingDocs.push(users.findByFields({ 'nested.field1': `value${i}` }))
    }

    /* 
        Intent here, with Promise.All, is to force batching to happen in the underlying dataloader library.
        
        This results in the following optimized filter to be passed to MongoDb:
      
        filter:  {
         'nested.field1': { '$in': [ 'value1', 'value2', 'value3' ] }
        }

        This in turn correctly matches Bob, Charlie and Dan records.

        Bob and Dan match filters passed to the first invocation of findByFields function: { 'nested.field1': [ 'value1' ] }

        Charlie matches filters passed to the second invocation of findByFields function: { 'nested.field1': [ 'value2' ] }
      */

    const docs = await Promise.all(pendingDocs)

    expect(docs[0][0].name).toBe('Bob')
    expect(docs[0][1].name).toBe('Dan')
    expect(docs[0].length).toBe(2)

    expect(docs[1][0].name).toBe('Charlie')
    expect(docs[1].length).toBe(1)

    expect(docs[2][0]).toBeUndefined()
    expect(docs[2].length).toBe(0)

    expect(docs.length).toBe(3)
  })

  test('nested findByFields with multiple filters and batching', async () => {
    const users = new Users(userCollection)
    users.initialize()

    let pendingDocs = []
    for (var i = 1; i <= 3; i++) {
      pendingDocs.push(
        users.findByFields({
          'nested.field1': `value${i}`,
          'nested.field2': `value${i}`
        })
      )
    }

    /* 
        Intent here, with Promise.All,  is to force batching to happen in the underlying dataloader library.
        This results in the following optimized filter to be passed to MongoDb:
      
        filter:  {
         'nested.field1': { '$in': [ 'value1', 'value2', 'value3' ] },
         'nested.field2': { '$in': [ 'value1', 'value2', 'value3' ] }
        }

        This in turn correctly matches Bob, Charlie and Dan records.

        However, only Bob and Charlie match original filters passed to findByFields function, so only those should be returned.

        { 'nested.field1': [ 'value1' ], 'nested.field2': [ 'value1' ] },
        { 'nested.field1': [ 'value2' ], 'nested.field2': [ 'value2' ] }

      */

    const docs = await Promise.all(pendingDocs)

    expect(docs[0][0].name).toBe('Bob')
    expect(docs[0].length).toBe(1)

    expect(docs[1][0].name).toBe('Charlie')
    expect(docs[1].length).toBe(1)

    expect(docs[2][0]).toBeUndefined()
    expect(docs[2].length).toBe(0)

    expect(docs.length).toBe(3)
  })
})
