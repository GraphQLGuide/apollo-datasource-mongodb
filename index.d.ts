declare module 'apollo-datasource-mongodb' {
  import { DataSource } from 'apollo-datasource'
  import { Collection as MongoCollection, ObjectId } from 'mongodb'
  import {
    Collection as MongooseCollection,
    Document,
    Model as MongooseModel,
  } from 'mongoose'

  export type Collection<T, U = MongoCollection<T>> = T extends Document
    ? MongooseCollection
    : U

  export type Model<T, U = MongooseModel<T>> = T extends Document
    ? U
    : undefined

  export type ModelOrCollection<T, U = Model<T>> = T extends Document
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

  export class MongoDataSource<TData, TContext = any> extends DataSource<
    TContext
  > {
    protected context: TContext
    protected collection: Collection<TData>
    protected model: Model<TData>

    constructor(modelOrCollection: ModelOrCollection<TData>)

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
