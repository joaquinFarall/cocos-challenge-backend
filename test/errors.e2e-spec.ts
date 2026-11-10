import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';

describe('Error response format', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('unknown route is 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body).toMatchObject({ status_code: 404, error: 'NOT_FOUND' });
  });

  it('a malformed path id is 400 BAD_REQUEST', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/abc/portfolio')
      .expect(400);
    expect(res.body).toMatchObject({ status_code: 400, error: 'BAD_REQUEST' });
  });

  it('an unknown user is 404 USER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/2147483647/portfolio')
      .expect(404);
    expect(res.body).toEqual({
      status_code: 404,
      error: 'USER_NOT_FOUND',
      message: 'User 2147483647 not found',
    });
  });

  it('malformed JSON uses the same shape', async () => {
    const res = await request(app.getHttpServer())
      .post('/users/1/orders')
      .set('Content-Type', 'application/json')
      .send('{"side": ')
      .expect(400);
    expect(res.body).toMatchObject({ status_code: 400, error: 'BAD_REQUEST' });
    expect(typeof res.body.message).toBe('string');
  });
});
