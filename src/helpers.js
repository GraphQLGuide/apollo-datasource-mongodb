const TYPEOF_COLLECTION = 'object'

export const isModel = x =>
  Boolean(
    typeof x === 'function' &&
      x.prototype &&
      /**
       * @see https://github.com/Automattic/mongoose/blob/b4e0ae52a57b886bc7046d38332ce3b38a2f9acd/lib/model.js#L116
       */
      x.prototype.$isMongooseModelPrototype
  )

export const isCollectionOrModel = x =>
  Boolean(x && (typeof x === TYPEOF_COLLECTION || isModel(x)))

export const getCollection = x => (isModel(x) ? x.collection : x)
