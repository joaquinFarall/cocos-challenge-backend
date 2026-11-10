import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/** Inserts a fresh user so each test is isolated from the seed. */
export async function createUser(app: INestApplication): Promise<number> {
  const rows: { id: number }[] = await app
    .get(DataSource)
    .query(
      `INSERT INTO users (email, accountnumber) VALUES ($1, $2) RETURNING id`,
      [`e2e-${Date.now()}-${Math.random()}@test.com`, 'E2E'],
    );
  return rows[0].id;
}
