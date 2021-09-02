"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MongoDataSource = void 0;

var _apolloDatasource = require("apollo-datasource");

var _apolloServerErrors = require("apollo-server-errors");

var _apolloServerCaching = require("apollo-server-caching");

var _cache = require("./cache");

var _helpers = require("./helpers");

class MongoDataSource extends _apolloDatasource.DataSource {
  constructor(collection) {
    super();

    if (!(0, _helpers.isCollectionOrModel)(collection)) {
      throw new _apolloServerErrors.ApolloError('MongoDataSource constructor must be given a collection or Mongoose model');
    }

    if ((0, _helpers.isModel)(collection)) {
      this.model = collection;
      this.collection = this.model.collection;
    } else {
      this.collection = collection;
    }
  } // https://github.com/apollographql/apollo-server/blob/master/packages/apollo-datasource/src/index.ts


  initialize({
    context,
    cache
  } = {}) {
    this.context = context;
    const methods = (0, _cache.createCachingMethods)({
      collection: this.collection,
      model: this.model,
      cache: cache || new _apolloServerCaching.InMemoryLRUCache()
    });
    Object.assign(this, methods);
  }

}

exports.MongoDataSource = MongoDataSource;