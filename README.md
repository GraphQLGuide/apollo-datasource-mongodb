[![npm version](https://badge.fury.io/js/apollo-datasource-mongodb.svg)](https://www.npmjs.com/package/apollo-datasource-mongodb)

Apollo [data source](https://www.apollographql.com/docs/apollo-server/data/fetching-data) for MongoDB

Note: This README applies to the current version 0.6.0 and is meant to be paired with Apollo Server 4.  
See the old [README](README.old.md) for versions 0.5.4 and below, if you are using Apollo Server 3.

**Installation**
```
npm i apollo-datasource-mongodb
```

This package uses [DataLoader](https://github.com/graphql/dataloader) for batching and per-request memoization caching. It also optionally (if you provide a `ttl`) does shared application-level caching (using either the default Apollo `InMemoryLRUCache` or the [cache you provide to ApolloServer()](https://www.apollographql.com/docs/apollo-server/performance/cache-backends#configuring-external-caching)). It does this for the following methods:

- [`findOneById(id, options)`](#findonebyid)
- [`findManyByIds(ids, options)`](#findmanybyids)
- [`findByFields(fields, options)`](#findbyfields)

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

**Contents:**

- [Usage](#usage)
  - [Basic](#basic)
  - [Batching](#batching)
  - [Caching](#caching)
  - [TypeScript](#typescript)
- [API](#api)
  - [findOneById](#findonebyid)
  - [findManyByIds](#findmanybyids)
  - [findByFields](#findbyfields)
    - [Examples](#examples)
  - [deleteFromCacheById](#deletefromcachebyid)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Usage

### Basic

The basic setup is subclassing `MongoDataSource`, passing your collection or Mongoose model to the constructor, and using the [API methods](#API):

`data-sources/Users.js`

```js
import { MongoDataSource } from 'apollo-datasource-mongodb'

export default class Users extends MongoDataSource {
  getUser(userId) {
    return this.findOneById(userId)
  }
}
```

and:

```js
import { MongoClient } from 'mongodb'
import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'

import Users from './data-sources/Users.js'

const client = new MongoClient('mongodb://localhost:27017/test')
client.connect()

const server = new ApolloServer({
  typeDefs,
  resolvers
})

const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => ({
    dataSources: {
      users: new Users({ modelOrCollection: client.db().collection('users') })
      // OR
      // users: new Users({ modelOrCollection: UserModel })
    }
  }),
})
```

Inside the data source, the collection is available at `this.collection` (e.g. `this.collection.update({_id: 'foo, { $set: { name: 'me' }}})`). The model (if you're using Mongoose) is available at `this.model` (`new this.model({ name: 'Alice' })`). By default, the API classes you create will not have access to the context. You can either choose to add the data that your API class needs on a case-by-case basis as members of the class, or you can add the entire context as a member of the class if you wish. All you need to do is add the field(s) to the options argument of the constructor and call super passing in options. For example, if you put the logged-in user's ID on context as `context.currentUserId` and you want your Users class to have access to `currentUserId`:

```js
class Users extends MongoDataSource {
  constructor(options) {
    super(options)
    this.currentUserId = options.currentUserId
  }

  async getPrivateUserData(userId) {
    const isAuthorized = this.currentUserId === userId
    if (isAuthorized) {
      const user = await this.findOneById(userId)
      return user && user.privateData
    }
  }
}
```

and you would instantiate the Users data source in the context like this

```js
...
const server = new ApolloServer({
  typeDefs,
  resolvers
})

const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => {
    const currentUserId = getCurrentUserId(req) // not a real function, for demo purposes only
    return {
      currentUserId,
      dataSources: {
        users: new Users({ modelOrCollection: UserModel, currentUserId })
      },
    }
  },
});
```

If you want your data source to have access to the entire context at `this.context`, you need to create a `Context` class so the context can refer to itself as `this` in the constructor for the data source.
See [dataSources](https://www.apollographql.com/docs/apollo-server/migration/#datasources) for more information regarding how data sources changed from Apollo Server 3 to Apollo Server 4.

```js
class Users extends MongoDataSource {
  constructor(options) {
    super(options)
    this.context = options.context
  }

  async getPrivateUserData(userId) {
    const isAuthorized = this.context.currentUserId === userId
    if (isAuthorized) {
      const user = await this.findOneById(userId)
      return user && user.privateData
    }
  }
}

...

class Context {
  constructor(req) {
    this.currentUserId = getCurrentUserId(req), // not a real function, for demo purposes only
    this.dataSources = {
      users: new Users({ modelOrCollection: UserModel, context: this })
    },
  }
}

...

const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => {
    return new Context(req)
  },
});
```

If you're passing a Mongoose model rather than a collection, Mongoose will be used for data fetching. All transformations defined on that model (virtuals, plugins, etc.) will be applied to your data before caching, just like you would expect it. If you're using reference fields, you might be interested in checking out [mongoose-autopopulate](https://www.npmjs.com/package/mongoose-autopopulate).

### Batching

This is the main feature, and is always enabled. Here's a full example:

```js
class Users extends MongoDataSource {
  getUser(userId) {
    return this.findOneById(userId)
  }
}

class Posts extends MongoDataSource {
  getPosts(postIds) {
    return this.findManyByIds(postIds)
  }
}

const resolvers = {
  Post: {
    author: (post, _, { dataSources: { users } }) =>
      users.getUser(post.authorId)
  },
  User: {
    posts: (user, _, { dataSources: { posts } }) => posts.getPosts(user.postIds)
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers
})

const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => ({
    dataSources: {
      users: new Users({ modelOrCollection: db.collection('users') }),
      posts: new Posts({ modelOrCollection: db.collection('posts') })
    }
  }),
})
```

### Caching

To enable shared application-level caching, you do everything from the above section, and you add the `ttl` (in seconds) option to `findOneById()`:

```js
const MINUTE = 60

class Users extends MongoDataSource {
  getUser(userId) {
    return this.findOneById(userId, { ttl: MINUTE })
  }

  updateUserName(userId, newName) {
    this.deleteFromCacheById(userId)
    return this.collection.updateOne(
      {
        _id: userId
      },
      {
        $set: { name: newName }
      }
    )
  }
}

const resolvers = {
  Post: {
    author: (post, _, { users }) => users.getUser(post.authorId)
  },
  Mutation: {
    changeName: (_, { userId, newName }, { users, currentUserId }) =>
      currentUserId === userId && users.updateUserName(userId, newName)
  }
}
```

Here we also call [`deleteFromCacheById()`](#deletefromcachebyid) to remove the user from the cache when the user's data changes. If we're okay with people receiving out-of-date data for the duration of our `ttl`—in this case, for as long as a minute—then we don't need to bother adding calls to `deleteFromCacheById()`.

### TypeScript

Since we are using a typed language, we want the provided methods to be correctly typed as well. This requires us to make the `MongoDataSource` class polymorphic. It requires 1 template argument, which is the type of the document in our collection. If you wish to add additional fields to your data source class, you can extend the typing on constructor options argument to include any fields that you need. For example:

`data-sources/Users.ts`

```ts
import { MongoDataSource } from 'apollo-datasource-mongodb'
import { ObjectId } from 'mongodb'

interface UserDocument {
  _id: ObjectId
  username: string
  password: string
  email: string
  interests: [string]
}

interface Context {
  loggedInUser: UserDocument
  dataSources: any
}

export default class Users extends MongoDataSource<UserDocument> {
  protected loggedInUser: UserDocument

  constructor(options: { loggedInUser: UserDocument } & MongoDataSourceConfig<UserDocument>) {
    super(options)
    this.loggedInUser = options.loggedInUser
  }

  getUser(userId) {
    // this.loggedInUser has type `UserDocument` as defined above
    // this.findOneById has type `(id: ObjectId) => Promise<UserDocument | null | undefined>`
    return this.findOneById(userId)
  }
}
```

and:

```ts
import { MongoClient } from 'mongodb'

import Users from './data-sources/Users.ts'

const client = new MongoClient('mongodb://localhost:27017/test')
client.connect()

const server = new ApolloServer({
  typeDefs,
  resolvers
})

const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => {
    const loggedInUser = getLoggedInUser(req) // this function does not exist, just for demo purposes
    return {
      loggedInUser,
      dataSources: {
        users: new Users({ modelOrCollection: client.db().collection('users'), loggedInUser }),
      },
    }
  },
});
```

You can also opt to pass the entire context into your data source class. You can do so by adding a protected context member 
to your data source class and modifying to options argument of the constructor to add a field for the context. Then, call super and
assign the context to the member field on your data source class. Note: context needs to be a class in order to do this.

```ts
import { MongoDataSource } from 'apollo-datasource-mongodb'
import { ObjectId } from 'mongodb'

interface UserDocument {
  _id: ObjectId
  username: string
  password: string
  email: string
  interests: [string]
}

class Context {
  loggedInUser: UserDocument
  dataSources: any

  constructor(req: any) {
    this.loggedInUser = getLoggedInUser(req)
    this.dataSources = {
      users: new Users({ modelOrCollection: client.db().collection('users'), context: this }),
    }
  }
}

export default class Users extends MongoDataSource<UserDocument> {
  protected context: Context

  constructor(options: { context: Context } & MongoDataSourceConfig<UserDocument>) {
    super(options)
    this.context = options.context
  }

  getUser(userId) {
    // this.context has type `Context` as defined above
    // this.findOneById has type `(id: ObjectId) => Promise<UserDocument | null | undefined>`
    return this.findOneById(userId)
  }
}
```

and:

```ts
import { MongoClient } from 'mongodb'

import Users from './data-sources/Users.ts'

const client = new MongoClient('mongodb://localhost:27017/test')
client.connect()

const server = new ApolloServer({
  typeDefs,
  resolvers
})

const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => {
    return new Context(req)
  },
});
```


## API

The type of the `id` argument must match the type used in the database. We currently support ObjectId and string types.

### findOneById

`this.findOneById(id, { ttl })`

Resolves to the found document. Uses DataLoader to load `id`. DataLoader uses `collection.find({ _id: { $in: ids } })`. Optionally caches the document if `ttl` is set (in whole positive seconds).

### findManyByIds

`this.findManyByIds(ids, { ttl })`

Calls [`findOneById()`](#findonebyid) for each id. Resolves to an array of documents.

### findByFields

`this.findByFields(fields, { ttl })`

Resolves to an array of documents matching the passed fields. If an empty object is passed as the `fields` parameter, resolves to an array containing all documents in the given collection.

`fields` has this type:

```ts
interface Fields {
  [fieldName: string]:
    | string
    | number
    | boolean
    | ObjectId
    | (string | number | boolean | ObjectId)[]
}
```

#### Examples

```js
// get user by username
// `collection.find({ username: $in: ['testUser'] })`
this.findByFields({
  username: 'testUser'
})

// get all users with either the "gaming" OR "games" interest
// `collection.find({ interests: $in: ['gaming', 'games'] })`
this.findByFields({
  interests: ['gaming', 'games']
})

// get user by username AND with either the "gaming" OR "games" interest
// `collection.find({ username: $in: ['testUser'], interests: $in: ['gaming', 'games'] })`
this.findByFields({
  username: 'testUser',
  interests: ['gaming', 'games']
})
```

### deleteFromCacheById

`this.deleteFromCacheById(id)`

Deletes a document from the cache that was fetched with `findOneById` or `findManyByIds`.

### deleteFromCacheByFields

`this.deleteFromCacheByFields(fields)`

Deletes a document from the cache that was fetched with `findByFields`. Fields should be passed in exactly the same way they were used to find with.
