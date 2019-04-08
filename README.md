[![npm version](https://badge.fury.io/js/apollo-datasource-mongodb.svg)](https://www.npmjs.com/package/apollo-datasource-mongodb)

Apollo [data source](https://www.apollographql.com/docs/apollo-server/features/data-sources) for MongoDB

```
npm i apollo-datasource-mongodb
```

This package uses [DataLoader](https://github.com/graphql/dataloader) for batching and per-request memoization caching. It also optionally (if you provide a `ttl`), does shared application-level caching (using either the default Apollo `InMemoryLRUCache` or the [cache you provide to ApolloServer()](https://www.apollographql.com/docs/apollo-server/features/data-sources#using-memcachedredis-as-a-cache-storage-backend)). It does this only for these two methods, which are added to your collections:

- [`findOneById(id, options)`](#findonebyid)
- [`findManyByIds(ids, options)`](#findmanybyids)


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Contents:**

- [Usage](#usage)
  - [Batching](#batching)
  - [Caching](#caching)
- [API](#api)
  - [findOneById](#findonebyid)
  - [findManyByIds](#findmanybyids)
  - [deleteFromCacheById](#deletefromcachebyid)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


## Usage

### Basic

The basic setup is subclassing `MongoDataSource`, setting your collections in the constructor, and then using the [API methods](#API) on your collections:

```js
import { MongoDataSource } from 'apollo-datasource-mongodb'

class MyMongo extends MongoDataSource {
  constructor() {
    super()
    this.collections = [users, posts]
  }

  getUser(userId) {
    return users.findOneById(userId)
  }
}
```

The request's context is available at `this.context`. For example, if you put the logged-in user's ID on context as `context.currentUserId`:

```js
class MyMongo extends MongoDataSource {
  ...

  async getPrivateUserData(userId) {
    const isAuthorized = this.context.currentUserId === userId
    if (isAuthorized) {
      const user = await users.findOneById(userId)
      return user && user.privateData
    }
  }
}
```

If you want to implement an initialize method, it must call the parent method:

```js
class MyMongo extends MongoDataSource {
  constructor() {
    super()
    this.collections = [users, posts]
  }

  initialize(config) {
    super.initialize(config)
    ...
  }
}
```

### Batching

This is the main feature, and is always enabled. Here's a full example:

```js
import { MongoClient } from 'mongodb'
import { MongoDataSource } from 'apollo-datasource-mongodb'
import { ApolloServer } from 'apollo-server'

let users
let posts

const client = new MongoClient('mongodb://localhost:27017')

client.connect(e => {
  users = client.db('users')
  posts = client.db('posts')
})

class MyMongo extends MongoDataSource {
  constructor() {
    super()
    this.collections = [users, posts]
  }

  getUser(userId) {
    return users.findOneById(userId)
  }

  getPosts(postIds) {
    return posts.findManyByIds(postIds)
  }
}

const resolvers = {
  Post: {
    author: (post, _, { db }) => db.getUser(post.authorId)
  },
  User: {
    posts: (user, _, { db }) => db.getPosts(user.postIds)
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => ({
    db: new MyMongo()
  })
})
```

You might prefer to structure it as one data source per collection, in which case you'd do:

```js
class Users extends MongoDataSource {
  constructor() {
    super()
    this.collections = [users]
  }

  getUser(userId) {
    return users.findOneById(userId)
  }
}

class Posts extends MongoDataSource {
  constructor() {
    super()
    this.collections = [posts]
  }

  getPosts(postIds) {
    return posts.findManyByIds(postIds)
  }
}

const resolvers = {
  Post: {
    author: (post, _, { users }) => users.getUser(post.authorId)
  },
  User: {
    posts: (user, _, { posts }) => posts.getPosts(user.postIds)
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => ({
    users: new Users(),
    posts: new Posts()
  })
})
```

This is purely a code structure choice—it doesn't affect batching or caching. The latter option probably makes more sense if you have more than a few methods in your class.

### Caching

To enable shared application-level caching, you do everything from the above section, and you add the `ttl` option to `findOneById()`:

```js
const MINUTE = 60

class MyMongo extends MongoDataSource {
  constructor() {
    super()
    this.collections = [users, posts]
  }

  getUser(userId) {
    return users.findOneById(userId, { ttl: MINUTE })
  }

  updateUserName(userId, newName) {
    users.deleteFromCacheById(userId)
    return users.updateOne({ 
      _id: userId 
    }, {
      $set: { name: newName }
    })
  }
}

const resolvers = {
  User: {
    posts: (user, _, { db }) => db.getPosts(user.postIds)
  },
  Mutation: {
    changeName: (_, { userId, newName }, { db, currentUserId }) => 
      currentUserId === userId && db.updateUserName(userId, newName)
  }
}
```

Here we also call [`deleteFromCacheById()`](#deletefromcachebyid) to remove the user from the cache when the user's data changes. If we're okay with people receiving out-of-date data for the duration of our `ttl`—in this case, for as long as a minute—then we don't need to bother adding calls to `deleteFromCacheById()`.

## API

### findOneById

`collection.findOneById(id, { ttl })`

Resolves to the found document. Uses DataLoader to load `id`. DataLoader uses `collection.find({ _id: { $in: ids } })`. Optionally caches the document if `ttl` is set (in whole seconds).

### findManyByIds

`collection.findManyByIds(ids, { ttl })`

Calls [`findOneById()`](#findonebyid) for each id. Resolves to an array of documents.

### deleteFromCacheById

`collection.deleteFromCacheById(id)`

Deletes a document from the cache.