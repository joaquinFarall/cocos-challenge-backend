import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/data-source-options';

/**
 * Starts a throwaway Postgres (same image as docker-compose), loads the seed
 * and runs the migrations with the same options the app uses. Never touches
 * a remote database.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withCopyFilesToContainer([
      {
        source: join(__dirname, '../../db/database.sql'),
        target: '/docker-entrypoint-initdb.d/01-database.sql',
      },
    ])
    .start();

  const url = container.getConnectionUri();
  const dataSource = new DataSource(buildDataSourceOptions(url));
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  // Jest workers inherit the environment of the main process.
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  (globalThis as { __PG_CONTAINER__?: unknown }).__PG_CONTAINER__ = container;
}
