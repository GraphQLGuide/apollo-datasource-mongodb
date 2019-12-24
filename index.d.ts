declare module 'apollo-datasource-mongodb' {
  import mongoose, { Document, Model } from 'mongoose'
  import { DataSource, DataSourceConfig } from 'apollo-datasource'

  type Options = { ttl: number }

  export abstract class MongoDataSource<T extends Document, TContext = any> extends DataSource {
    collection: mongoose.Collection | Model<T>
    constructor(collection: mongoose.Collection | Model<T>)
    public initialize(config: DataSourceConfig<TContext>): void
    protected findOneById(id: string, { ttl }?: Options): T | null
    protected findManyByIds(ids: string[], { ttl }?: Options): (T| null)[]
    protected deleteFromCacheById(id: string): void
  }
}
