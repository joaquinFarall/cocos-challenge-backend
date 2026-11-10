import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';

describe('Seed and migrations (smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is 200', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('serves the corrected seed portfolio of user 1', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/1/portfolio')
      .expect(200);
    expect(res.body.total_cash).toBe('707100.00');
    expect(res.body.available).toBe('581600.00');
    expect(res.body.total_value).toBe('888940.00');
  });
});
