import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { Instrument } from './entities/instrument.entity';
import { MarketData } from './entities/market-data.entity';
import { Order } from './entities/order.entity';
import { User } from './entities/user.entity';

/** Shared by the Nest app and the TypeORM CLI. Schema changes only via migrations. */
export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [User, Instrument, Order, MarketData],
    migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
    synchronize: false,
    migrationsRun: false,
  };
}
