import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './data-source-options';

// Used by the TypeORM CLI only (see the migration:* npm scripts).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the process environment.
}

const env = validateEnv(process.env);

export default new DataSource(buildDataSourceOptions(env.DATABASE_URL));
