declare module 'apollo-datasource-mongodb' {
  import { DataSource, DataSourceConfig } from 'apollo-datasource'
  import * as mongoose from 'mongoose'

  export {
    DataSourceConfig
  }

  interface Options { ttl: number }

  export abstract class MongoDataSource<T extends mongoose.Document, TContext = any> extends DataSource {
    collection: mongoose.Collection
    model?: mongoose.Model<T>
    constructor(collection: mongoose.Collection | mongoose.Model<T>)
    public initialize(config: DataSourceConfig<TContext>): void
    protected findOneById(id: string, { ttl }?: Options): T | null
    protected findManyByIds(ids: string[], { ttl }?: Options): (T| null)[]
    protected deleteFromCacheById(id: string): void
  }
}
