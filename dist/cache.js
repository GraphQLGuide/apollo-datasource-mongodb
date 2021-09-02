"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createCachingMethods = exports.stringToId = exports.isValidObjectIdString = exports.idToString = void 0;

var _dataloader = _interopRequireDefault(require("dataloader"));

var _mongodb = require("mongodb");

var _bson = require("bson");

var _helpers = require("./helpers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const idToString = id => id instanceof _mongodb.ObjectId ? id.toHexString() : id; // https://www.geeksforgeeks.org/how-to-check-if-a-string-is-valid-mongodb-objectid-in-nodejs/


exports.idToString = idToString;

const isValidObjectIdString = string => _mongodb.ObjectId.isValid(string) && String(new _mongodb.ObjectId(string)) === string;

exports.isValidObjectIdString = isValidObjectIdString;

const stringToId = string => {
  if (string instanceof _mongodb.ObjectId) {
    return string;
  }

  if (isValidObjectIdString(string)) {
    return new _mongodb.ObjectId(string);
  }

  return string;
};

exports.stringToId = stringToId;

const fieldToDocField = key => key === 'id' ? '_id' : key; // https://github.com/graphql/dataloader#batch-function
// "The Array of values must be the same length as the Array of keys."
// "Each index in the Array of values must correspond to the same index in the Array of keys."


const orderDocs = fieldsArray => docs => fieldsArray.map(fields => docs.filter(doc => {
  for (let fieldName of Object.keys(fields)) {
    const fieldValue = fields[fieldName];
    if (typeof fieldValue === 'undefined') continue;
    const filterValuesArr = Array.isArray(fieldValue) ? fieldValue.map(val => idToString(val)) : [idToString(fieldValue)];
    const docValue = doc[fieldToDocField(fieldName)];
    const docValuesArr = Array.isArray(docValue) ? docValue.map(val => idToString(val)) : [idToString(docValue)];
    let isMatch = false;

    for (const filterVal of filterValuesArr) {
      if (docValuesArr.includes(filterVal)) {
        isMatch = true;
      }
    }

    if (!isMatch) return false;
  }

  return true;
}));

const createCachingMethods = ({
  collection,
  model,
  cache
}) => {
  const loader = new _dataloader.default(jsonArray => {
    const fieldsArray = jsonArray.map(JSON.parse);
    const filterArray = fieldsArray.reduce((filterArray, fields) => {
      const existingFieldsFilter = filterArray.find(filter => [...Object.keys(filter)].sort().join() === [...Object.keys(fields)].sort().join());
      const filter = existingFieldsFilter || {};

      for (const fieldName in fields) {
        if (typeof fields[fieldName] === 'undefined') continue;
        const docFieldName = fieldToDocField(fieldName);
        if (!filter[docFieldName]) filter[docFieldName] = {
          $in: []
        };
        let newVals = Array.isArray(fields[fieldName]) ? fields[fieldName] : [fields[fieldName]];
        filter[docFieldName].$in = [...filter[docFieldName].$in, ...newVals.map(stringToId).filter(val => !filter[docFieldName].$in.includes(val))];
      }

      if (existingFieldsFilter) return filterArray;
      return [...filterArray, filter];
    }, []);
    const filter = filterArray.length === 1 ? filterArray[0] : {
      $or: filterArray
    };
    const promise = model ? model.find(filter).lean().exec() : collection.find(filter).toArray();
    return promise.then(orderDocs(fieldsArray));
  });
  const cachePrefix = `mongo-${(0, _helpers.getCollection)(collection).collectionName}-`;
  const methods = {
    findOneById: async (id, {
      ttl
    } = {}) => {
      const key = cachePrefix + idToString(id);
      const cacheDoc = await cache.get(key);

      if (cacheDoc) {
        return _bson.EJSON.parse(cacheDoc);
      }

      const docs = await loader.load(JSON.stringify({
        id
      }));

      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, _bson.EJSON.stringify(docs[0]), {
          ttl
        });
      }

      return docs[0];
    },
    findManyByIds: (ids, {
      ttl
    } = {}) => {
      return Promise.all(ids.map(id => methods.findOneById(id, {
        ttl
      })));
    },
    findByFields: async (fields, {
      ttl
    } = {}) => {
      const cleanedFields = {};
      Object.keys(fields).sort().forEach(key => {
        if (typeof key !== 'undefined') {
          cleanedFields[key] = Array.isArray(fields[key]) ? fields[key] : [fields[key]];
        }
      });
      const loaderJSON = JSON.stringify(cleanedFields);
      const key = cachePrefix + loaderJSON;
      const cacheDoc = await cache.get(key);

      if (cacheDoc) {
        return _bson.EJSON.parse(cacheDoc);
      }

      const fieldNames = Object.keys(cleanedFields);
      let docs;

      if (fieldNames.length === 1) {
        const field = cleanedFields[fieldNames[0]];
        const fieldArray = Array.isArray(field) ? field : [field];
        const docsArray = await Promise.all(fieldArray.map(value => {
          const filter = {};
          filter[fieldNames[0]] = value;
          return loader.load(JSON.stringify(filter));
        }));
        docs = [].concat(...docsArray);
      } else {
        docs = await loader.load(loaderJSON);
      }

      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, _bson.EJSON.stringify(docs), {
          ttl
        });
      }

      return docs;
    },
    deleteFromCacheById: async id => {
      loader.clear(JSON.stringify({
        id
      }));
      await cache.delete(cachePrefix + idToString(id));
    }
  };
  return methods;
};

exports.createCachingMethods = createCachingMethods;