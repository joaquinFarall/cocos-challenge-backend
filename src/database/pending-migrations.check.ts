import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource, MigrationExecutor } from 'typeorm';

/**
 * Fails startup when migrations are pending (ADR-21). Read-only: unlike
 * `DataSource.showMigrations()`, `getPendingMigrations()` does not create the
 * migrations table on an unmigrated database.
 */
@Injectable()
export class PendingMigrationsCheck implements OnApplicationBootstrap {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    const pending = await new MigrationExecutor(
      this.dataSource,
    ).getPendingMigrations();
    if (pending.length > 0) {
      throw new Error(
        `Pending database migrations: ${pending.map((m) => m.name).join(', ')}. ` +
          'Run "npm run migration:run" to apply them. ' +
          'Note: this modifies the database DATABASE_URL points to.',
      );
    }
  }
}
