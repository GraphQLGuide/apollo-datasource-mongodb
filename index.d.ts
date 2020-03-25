declare module 'apollo-datasource-mongodb' {
  import { DataSource } from 'apollo-datasource'
  import { Collection as MongoCollection, ObjectId } from 'mongodb'
  import {
    Collection as MongooseCollection,
    Document,
    Model as MongooseModel
  } from 'mongoose'

  export type Collection<T> = T extends Document
    ? MongooseCollection
    : MongoCollection<T>

  export type Model<T> = T extends Document ? MongooseModel<T> : never

  export type ModelOrCollection<T> = T extends Document
    ? Model<T>
    : Collection<T>

  export interface Options {
    ttl: number
  }

  export class MongoDataSource<TData, TContext = any> extends DataSource<
    TContext
  > {
    protected collection: Collection<TData>
    protected model: Model<TData>

    constructor(modelOrCollection: ModelOrCollection<TData>)

    findOneById(
      id: ObjectId,
      options?: Options
    ): Promise<TData | null | undefined>

    findManyByIds(
      ids: ObjectId[],
      options?: Options
    ): Promise<(TData | null | undefined)[]>

    deleteFromCacheById(id: ObjectId): void
  }
}
