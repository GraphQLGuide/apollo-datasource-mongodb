[![npm version](https://badge.fury.io/js/apollo-datasource-mongodb.svg)](https://www.npmjs.com/package/apollo-datasource-mongodb)

Apollo [data source](https://www.apollographql.com/docs/apollo-server/features/data-sources) for MongoDB

```
npm i apollo-datasource-mongodb
```

This package uses [DataLoader](https://github.com/graphql/dataloader) for batching and per-request memoization caching. It also optionally (if you provide a `ttl`), does shared application-level caching (using either the default Apollo `InMemoryLRUCache` or the [cache you provide to ApolloServer()](https://www.apollographql.com/docs/apollo-server/features/data-sources#using-memcachedredis-as-a-cache-storage-backend)). It does this only for these two methods:

- [`findOneById(id, options)`](#findonebyid)
- [`findManyByIds(ids, options)`](#findmanybyids)


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Contents:**

- [Usage](#usage)
  - [Basic](#basic)
  - [Batching](#batching)
  - [Caching](#caching)
- [API](#api)
  - [findOneById](#findonebyid)
  - [findManyByIds](#findmanybyids)
  - [deleteFromCacheById](#deletefromcachebyid)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


## Usage

### Basic

The basic setup is subclassing `MongoDataSource`, passing your collection or Mongoose model to the constructor, and using the [API methods](#API):

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
import Users from './data-sources/Users.js'

const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => ({
    users: new Users(db.collection('users'))
    // OR
    // users: new Users(UserModel)
  })
})
```

Inside the data source, the collection is available at `this.collection` (e.g. `this.collection.update({_id: 'foo, { $set: { name: 'me' }}})`). The model (if applicable) is available at `this.model` (`new this.model({ name: 'Alice' })`). The request's context is available at `this.context`. For example, if you put the logged-in user's ID on context as `context.currentUserId`:

```js
class Users extends MongoDataSource {
  ...

  async getPrivateUserData(userId) {
    const isAuthorized = this.context.currentUserId === userId
    if (isAuthorized) {
      const user = await this.findOneById(userId)
      return user && user.privateData
    }
  }
}
```

If you want to implement an initialize method, it must call the parent method:

```js
class Users extends MongoDataSource {
  initialize(config) {
    super.initialize(config)
    ...
  }
}
```

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
    users: new Users(db.collection('users')),
    posts: new Posts(db.collection('posts'))
  })
})
```

### Caching

To enable shared application-level caching, you do everything from the above section, and you add the `ttl` option to `findOneById()`:

```js
const MINUTE = 60

class Users extends MongoDataSource {
  getUser(userId) {
    return this.findOneById(userId, { ttl: MINUTE })
  }

  updateUserName(userId, newName) {
    this.deleteFromCacheById(userId)
    return this.collection.updateOne({ 
      _id: userId 
    }, {
      $set: { name: newName }
    })
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

## API

### findOneById

`this.findOneById(id, { ttl })`

Resolves to the found document. Uses DataLoader to load `id`. DataLoader uses `collection.find({ _id: { $in: ids } })`. Optionally caches the document if `ttl` is set (in whole seconds).

### findManyByIds

`this.findManyByIds(ids, { ttl })`

Calls [`findOneById()`](#findonebyid) for each id. Resolves to an array of documents.

### deleteFromCacheById

`this.deleteFromCacheById(id)`

Deletes a document from the cache.