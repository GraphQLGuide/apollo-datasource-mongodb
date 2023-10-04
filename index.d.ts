declare module 'apollo-datasource-mongodb' {
  import { KeyValueCache } from '@apollo/utils.keyvaluecache'
  import { Collection as MongoCollection, ObjectId } from 'mongodb'
  import {
    Collection as MongooseCollection,
    Document,
    Model as MongooseModel,
  } from 'mongoose'

  export type Collection<T extends { [key: string]: any }, U = MongoCollection<T>> = T extends Document
    ? MongooseCollection
    : U

  export type Model<T, U = MongooseModel<T>> = T extends Document
    ? U
    : undefined

  export type ModelOrCollection<T extends { [key: string]: any }, U = Model<T>> = T extends Document
    ? U
    : Collection<T>

  export interface Fields {
    [fieldName: string]:
      | string
      | number
      | boolean
      | ObjectId
      | (string | number | boolean | ObjectId)[]
  }

  export interface Options {
    ttl: number
  }

  export interface MongoDataSourceConfig<TData extends { [key: string]: any }> {
    modelOrCollection: ModelOrCollection<TData>
    cache?: KeyValueCache<TData>
  }

  export class MongoDataSource<TData extends { [key: string]: any }> {
    protected collection: Collection<TData>
    protected model: Model<TData>

    constructor(options: MongoDataSourceConfig<TData>)

    findOneById(
      id: ObjectId | string,
      options?: Options
    ): Promise<TData | null | undefined>

    findManyByIds(
      ids: (ObjectId | string)[],
      options?: Options
    ): Promise<(TData | null | undefined)[]>

    findByFields(
      fields: Fields,
      options?: Options
    ): Promise<(TData | null | undefined)[]>

    deleteFromCacheById(id: ObjectId | string): Promise<void>
    deleteFromCacheByFields(fields: Fields): Promise<void>
  }
}
