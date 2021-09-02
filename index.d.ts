declare module 'apollo-datasource-mongodb' {
  import { DataSource } from 'apollo-datasource'
  import { Collection as MongoCollection, ObjectId as MongoDBObjectId } from 'mongodb'
  import {
    Collection as MongooseCollection,
    Document,
    Model as MongooseModel,
    LeanDocument,
    ObjectId as MongooseObjectId
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

  type ObjectId = MongoDBObjectId | MongooseObjectId;

  export interface Fields {
    [fieldName: string]:
      | string
      | number
      | boolean
      | ObjectId
      | (string | number | boolean | ObjectId)[]
  }

  type MongooseDocumentOrMongoCollection<T> = MongoCollection<T> | Document

  export interface Options {
    ttl: number
  }

  export class MongoDataSource<TData extends MongooseDocumentOrMongoCollection<any>, TContext = any> extends DataSource<
    TContext
  > {
    protected context: TContext
    protected collection: Collection<TData>
    protected model: Model<TData>

    constructor(modelOrCollection: ModelOrCollection<TData>)

    findOneById(
      id: ObjectId | string,
      options?: Options
    ): Promise<LeanDocument<TData> | null | undefined>

    findManyByIds(
      ids: (ObjectId | string)[],
      options?: Options
    ): Promise<(LeanDocument<TData> | null | undefined)[]>

    findByFields(
      fields: Fields,
      options?: Options
    ): Promise<(LeanDocument<TData> | null | undefined)[]>

    deleteFromCacheById(id: ObjectId | string): Promise<void>
    deleteFromCacheByFields(fields: Fields): Promise<void>
  }
}
