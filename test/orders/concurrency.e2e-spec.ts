import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../setup/app';
import { ARS, PAMP, createOrderHelpers } from './helpers';

describe('POST /users/:id/orders', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const { place, portfolio, rowsOf, fundedUser } = createOrderHelpers(
    () => app,
  );

  describe('concurrency (ADR-12: row lock on the user)', () => {
    const PARALLEL = 10;
    const statuses = (responses: request.Response[]) =>
      responses.map((r) => r.body.status as string);
    const count = (list: string[], status: string) =>
      list.filter((s) => s === status).length;

    it('parallel MARKET BUYs: only the one the cash covers is FILLED', async () => {
      const userId = await fundedUser(1000); // one PAMP costs 925.85, two do not
      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          place(userId, {
            instrument_id: PAMP,
            side: 'BUY',
            type: 'MARKET',
            size: 1,
          }),
        ),
      );

      responses.forEach((r) => expect(r.status).toBe(201));
      const result = statuses(responses);
      expect(count(result, 'FILLED')).toBe(1);
      expect(count(result, 'REJECTED')).toBe(PARALLEL - 1);
      responses
        .filter((r) => r.body.status === 'REJECTED')
        .forEach((r) =>
          expect(r.body.rejection_reason).toBe('INSUFFICIENT_FUNDS'),
        );

      const p = await portfolio(userId);
      expect(p.total_cash).toBe('74.15');
      expect(p.available).toBe('74.15');
      expect(p.assets[0].shares).toBe(1);
      expect(await rowsOf(userId)).toHaveLength(1 + PARALLEL); // CASH_IN + every attempt
    });

    it('parallel LIMIT BUYs cannot reserve the same cash twice', async () => {
      const userId = await fundedUser(1000);
      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          place(userId, {
            instrument_id: PAMP,
            side: 'BUY',
            type: 'LIMIT',
            size: 1,
            price: '600',
          }),
        ),
      );

      const result = statuses(responses);
      expect(count(result, 'NEW')).toBe(1);
      expect(count(result, 'REJECTED')).toBe(PARALLEL - 1);
      expect((await portfolio(userId)).available).toBe('400.00');
    });

    it('parallel MARKET SELLs: the shares are sold once', async () => {
      const userId = await fundedUser(10000, { instrumentId: PAMP, size: 5 });
      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          place(userId, {
            instrument_id: PAMP,
            side: 'SELL',
            type: 'MARKET',
            size: 5,
          }),
        ),
      );

      const result = statuses(responses);
      expect(count(result, 'FILLED')).toBe(1);
      expect(count(result, 'REJECTED')).toBe(PARALLEL - 1);
      responses
        .filter((r) => r.body.status === 'REJECTED')
        .forEach((r) =>
          expect(r.body.rejection_reason).toBe('INSUFFICIENT_SHARES'),
        );

      const p = await portfolio(userId);
      expect(p.assets).toEqual([]);
      expect(p.total_cash).toBe('10000.00');
    });

    it('parallel LIMIT SELLs cannot reserve the same shares twice', async () => {
      const userId = await fundedUser(10000, { instrumentId: PAMP, size: 5 });
      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          place(userId, {
            instrument_id: PAMP,
            side: 'SELL',
            type: 'LIMIT',
            size: 5,
            price: '1000',
          }),
        ),
      );

      const result = statuses(responses);
      expect(count(result, 'NEW')).toBe(1);
      expect(count(result, 'REJECTED')).toBe(PARALLEL - 1);
    });

    it('parallel CASH_OUTs never take the cash below zero', async () => {
      const userId = await fundedUser(1000);
      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          place(userId, {
            instrument_id: ARS,
            side: 'CASH_OUT',
            type: 'MARKET',
            size: 400,
          }),
        ),
      );

      expect(count(statuses(responses), 'FILLED')).toBe(2);
      const p = await portfolio(userId);
      expect(p.total_cash).toBe('200.00');
      expect(p.available).toBe('200.00');
    });

    it('a mix of order kinds on one user keeps the ledger consistent', async () => {
      const userId = await fundedUser(5000);
      const bodies = [
        ...Array.from({ length: 6 }, () => ({
          instrument_id: PAMP,
          side: 'BUY',
          type: 'MARKET',
          size: 1,
        })),
        ...Array.from({ length: 4 }, () => ({
          instrument_id: ARS,
          side: 'CASH_OUT',
          type: 'MARKET',
          size: 1500,
        })),
      ];
      const responses = await Promise.all(bodies.map((b) => place(userId, b)));
      responses.forEach((r) => expect(r.status).toBe(201));

      const p = await portfolio(userId);
      expect(Number(p.total_cash)).toBeGreaterThanOrEqual(0);
      expect(Number(p.available)).toBeGreaterThanOrEqual(0);

      const filled = (await rowsOf(userId)).filter(
        (r) => r.status === 'FILLED',
      );
      const spent = filled
        .filter((r) => r.side !== 'CASH_IN')
        .reduce((sum, r) => sum + r.size * Number(r.price), 0);
      expect(spent).toBeLessThanOrEqual(5000);
    });

    it('different users do not interfere with each other', async () => {
      const users = await Promise.all([
        fundedUser(1000),
        fundedUser(1000),
        fundedUser(1000),
      ]);
      const results = await Promise.all(
        users.map(async (userId) =>
          Promise.all(
            Array.from({ length: 5 }, () =>
              place(userId, {
                instrument_id: PAMP,
                side: 'BUY',
                type: 'MARKET',
                size: 1,
              }),
            ),
          ),
        ),
      );
      for (const responses of results) {
        const result = statuses(responses);
        expect(count(result, 'FILLED')).toBe(1);
        expect(count(result, 'REJECTED')).toBe(4);
      }
    });
  });
});
