import { EJSON } from 'bson'
import DataLoader from 'dataloader'
import { ObjectId } from 'mongodb'

import { getCollection, log } from './helpers'

/**
 * @param {string | ObjectId} id
 */
export const idToString = id => {
  if (id instanceof ObjectId) {
    return id.toHexString()
  } else {
    return id && id.toString ? id.toString() : id
  }
}

/**
 * https://www.geeksforgeeks.org/how-to-check-if-a-string-is-valid-mongodb-objectid-in-nodejs/
 * @param {string} str
 */
export const isValidObjectIdString = str =>
  ObjectId.isValid(str) && String(new ObjectId(str)) === str

/**
 * @param {string | ObjectId} string
 */
export const stringToId = string => {
  if (string instanceof ObjectId) {
    return string
  }

  if (isValidObjectIdString(string)) {
    return new ObjectId(string)
  }

  return string
}

/**
 * @param {Record<string, unknown>} fields
 */
export function prepFields(fields) {
  const cleanedFields = {}

  Object.keys(fields)
    .sort()
    .forEach(key => {
      if (typeof key !== 'undefined') {
        cleanedFields[key] = Array.isArray(fields[key])
          ? fields[key]
          : [fields[key]]
      }
    })

  return { loaderKey: EJSON.stringify(cleanedFields), cleanedFields }
}

/**
 * @param {object} obj
 * @param {string} str
 * @example getNestedValue({ nested: { foo: 'bar' } }, 'nested.foo') => 'bar'
 */
export function getNestedValue(obj, str) {
  str = str.replace(/\[(\w+)\]/g, '.$1') // convert indexes to properties
  str = str.replace(/^\./, '') // strip a leading dot
  var a = str.split('.')
  for (var i = 0, n = a.length; i < n; ++i) {
    var k = a[i]
    if (k in obj) {
      obj = obj[k]
    } else {
      return
    }
  }
  return obj
}

/**
 * https://github.com/graphql/dataloader#batch-function
 * @description "The Array of values must be the same length as the Array of keys."
 * @description "Each index in the Array of values must correspond to the same index in the Array of keys."
 * @param {Array<Record<string | number, unknown>>} fieldsArray
 * @param {Array<Record<string | number, unknown>>} docs
 */
function orderDocs(fieldsArray, docs) {
  return fieldsArray.map(fields =>
    docs.filter(doc => {
      for (let fieldName of Object.keys(fields)) {
        const fieldValue = getNestedValue(fields, fieldName)

        if (typeof fieldValue === 'undefined') continue

        const filterValuesArr = Array.isArray(fieldValue)
          ? fieldValue.map(val => idToString(val))
          : [idToString(fieldValue)]

        const docValue = doc[fieldName]
        const docValuesArr = Array.isArray(docValue)
          ? docValue.map(val => idToString(val))
          : [idToString(docValue)]

        let isMatch = false
        for (const filterVal of filterValuesArr) {
          if (docValuesArr.includes(filterVal)) {
            isMatch = true
          }
        }

        if (!isMatch) return false
      }
      return true
    })
  )
}

/**
 *
 * @param {{
 *  collection: import('mongodb').Collection
 *  model: import('mongoose').Model
 *  cache: import('@apollo/utils.keyvaluecache').KeyValueCache
 *  options?: import('apollo-datasource-mongodb').MongoDataSourceOptions
 * }} params
 */
export function createCachingMethods({ collection, model, cache, options }) {
  const loader = new DataLoader(
    async ejsonArray => {
      const fieldsArray = ejsonArray.map(EJSON.parse)
      log('fieldsArray', fieldsArray)

      const filterArray = fieldsArray.reduce((filterArray, fields) => {
        const existingFieldsFilter = filterArray.find(
          filter =>
            Object.keys(filter)
              .sort()
              .join() ===
            Object.keys(fields)
              .sort()
              .join()
        )
        const filter = existingFieldsFilter || {}

        for (const fieldName in fields) {
          if (typeof fields[fieldName] === 'undefined') continue
          if (!filter[fieldName]) filter[fieldName] = { $in: [] }
          let newVals = Array.isArray(fields[fieldName])
            ? fields[fieldName]
            : [fields[fieldName]]

          filter[fieldName].$in = [
            ...filter[fieldName].$in,
            ...newVals
              .map(stringToId)
              .filter(val => !filter[fieldName].$in.includes(val))
          ]
        }
        if (existingFieldsFilter) return filterArray
        return [...filterArray, filter]
      }, [])
      log('filterArray: ', filterArray)

      const filter =
        filterArray.length === 1
          ? filterArray[0]
          : {
              $or: filterArray
            }
      log('filter: ', filter)

      const findPromise = model
        ? model.find(filter, undefined, { lean: options?.lean })
        : collection.find(filter).toArray()

      const results = await findPromise
      log('results: ', results)

      const orderedDocs = orderDocs(fieldsArray, results)
      log('orderedDocs: ', orderedDocs)

      return orderedDocs
    },
    { cache: !options?.disableMemoize }
  )

  const cachePrefix = `${options?.keyPrefix ?? ''}${
    getCollection(collection).collectionName
  }:`

  const methods = {
    findOneById: async (_id, { ttl } = {}) => {
      const cacheKey = cachePrefix + idToString(_id)

      const cacheDoc = await cache.get(cacheKey)
      log('findOneById found in cache:', cacheDoc)
      if (cacheDoc) {
        return EJSON.parse(cacheDoc)
      }

      log(`Dataloader.load: ${EJSON.stringify({ _id })}`)
      const docs = await loader.load(EJSON.stringify({ _id }))
      log('Dataloader.load returned: ', docs)
      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(cacheKey, EJSON.stringify(docs[0]), { ttl })
      }

      return docs[0]
    },
    findManyByIds: (ids, { ttl } = {}) => {
      return Promise.all(ids.map(id => methods.findOneById(id, { ttl })))
    },
    findByFields: async (fields, { ttl } = {}) => {
      const { cleanedFields, loaderKey } = prepFields(fields)
      const cacheKey = cachePrefix + loaderKey

      const cacheDoc = await cache.get(cacheKey)
      if (cacheDoc) {
        log('cacheDoc', cacheDoc)
        return EJSON.parse(cacheDoc)
      }

      const fieldNames = Object.keys(cleanedFields)
      let docs

      if (fieldNames.length === 1) {
        const field = cleanedFields[fieldNames[0]]
        const fieldArray = Array.isArray(field) ? field : [field]
        const docsArray = await Promise.all(
          fieldArray.map(value => {
            const filter = {}
            filter[fieldNames[0]] = value
            return loader.load(EJSON.stringify(filter))
          })
        )
        docs = [].concat(...docsArray)
        log('docsArray', docsArray)
      } else {
        log('loader.load', loaderKey)
        docs = await loader.load(loaderKey)
      }

      if (Number.isInteger(ttl)) {
        log('cache.set', cacheKey, EJSON.stringify(docs), { ttl })
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(cacheKey, EJSON.stringify(docs), { ttl })
      }

      return docs
    },
    deleteFromCacheById: async _id => {
      loader.clear(EJSON.stringify({ _id }))
      const cacheKey = cachePrefix + idToString(_id)
      await cache.delete(cacheKey)
    },
    deleteFromCacheByFields: async fields => {
      const { loaderKey } = prepFields(fields)
      const cacheKey = cachePrefix + loaderKey

      loader.clear(loaderKey)
      await cache.delete(cacheKey)
    }
  }

  return methods
}
