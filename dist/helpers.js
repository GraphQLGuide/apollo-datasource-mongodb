"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.log = exports.getCollection = exports.isCollectionOrModel = exports.isModel = void 0;
const TYPEOF_COLLECTION = 'object';

const isModel = x => Boolean(typeof x === 'function' && x.prototype &&
/**
 * @see https://github.com/Automattic/mongoose/blob/b4e0ae52a57b886bc7046d38332ce3b38a2f9acd/lib/model.js#L116
 */
x.prototype.$isMongooseModelPrototype);

exports.isModel = isModel;

const isCollectionOrModel = x => Boolean(x && (typeof x === TYPEOF_COLLECTION || isModel(x)));

exports.isCollectionOrModel = isCollectionOrModel;

const getCollection = x => isModel(x) ? x.collection : x;

exports.getCollection = getCollection;
const DEBUG = false;

const log = (...args) => DEBUG && console.log(...args);

exports.log = log;