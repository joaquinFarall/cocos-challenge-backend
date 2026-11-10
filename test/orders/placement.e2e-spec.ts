import type { INestApplication } from '@nestjs/common';
import { createTestApp, createUser } from '../setup/app';
import { ARS, PAMP, BMA, createOrderHelpers } from './helpers';

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

  describe('accepted orders', () => {
    it('fills a MARKET BUY at the latest close and stores it', async () => {
      const userId = await fundedUser(10000);
      const before = Date.now();
      const res = await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'MARKET',
        size: 5,
      }).expect(201);

      expect(res.body).toEqual({
        id: expect.any(Number),
        instrument_id: PAMP,
        user_id: userId,
        side: 'BUY',
        size: 5,
        price: '925.85',
        type: 'MARKET',
        status: 'FILLED',
        rejection_reason: null,
        datetime: expect.any(String),
      });
      expect(
        Math.abs(new Date(res.body.datetime).getTime() - before),
      ).toBeLessThan(60_000);

      const [, stored] = await rowsOf(userId);
      expect(stored).toMatchObject({
        id: res.body.id,
        side: 'BUY',
        size: 5,
        price: '925.85',
        status: 'FILLED',
        rejection_reason: null,
      });
    });

    it('creates a LIMIT BUY as NEW at its own price and reserves the cash', async () => {
      const userId = await fundedUser(10000);
      const res = await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        size: 10,
        price: '800.50',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'NEW',
        price: '800.50',
        rejection_reason: null,
      });

      const p = await portfolio(userId);
      expect(p.total_cash).toBe('10000.00');
      expect(p.available).toBe('1995.00');
      expect(p.assets).toEqual([]);
    });

    it('sizes an amount as floor(amount / price)', async () => {
      const userId = await fundedUser(10000);
      const market = await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'MARKET',
        amount: '2000',
      }).expect(201);
      expect(market.body).toMatchObject({
        size: 2,
        price: '925.85',
        status: 'FILLED',
      });

      const limit = await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        price: '100.50',
        amount: '1000',
      }).expect(201);
      expect(limit.body).toMatchObject({
        size: 9,
        price: '100.50',
        status: 'NEW',
      });
    });

    it('MARKET SELL fills at the close and adds the cash', async () => {
      const userId = await fundedUser(10000, { instrumentId: BMA, size: 2 });
      const res = await place(userId, {
        instrument_id: BMA,
        side: 'SELL',
        type: 'MARKET',
        size: 2,
      }).expect(201);
      expect(res.body).toMatchObject({ status: 'FILLED', price: '1502.80' });

      const p = await portfolio(userId);
      expect(p.total_cash).toBe('10000.00');
      expect(p.assets).toEqual([]);
    });

    it('CASH_IN and CASH_OUT move cash at price 1', async () => {
      const userId = await createUser(app);
      const cashInRes = await place(userId, {
        instrument_id: ARS,
        side: 'CASH_IN',
        type: 'MARKET',
        size: 1000,
      }).expect(201);
      expect(cashInRes.body).toMatchObject({
        status: 'FILLED',
        price: '1.00',
        size: 1000,
      });

      const cashOut = await place(userId, {
        instrument_id: ARS,
        side: 'CASH_OUT',
        type: 'MARKET',
        size: 400,
      }).expect(201);
      expect(cashOut.body).toMatchObject({ status: 'FILLED', price: '1.00' });

      const p = await portfolio(userId);
      expect(p.total_cash).toBe('600.00');
      expect(p.available).toBe('600.00');
    });

    it('a cash order sized by amount uses price 1', async () => {
      const userId = await createUser(app);
      const res = await place(userId, {
        instrument_id: ARS,
        side: 'CASH_IN',
        type: 'MARKET',
        amount: '500.99',
      }).expect(201);
      expect(res.body).toMatchObject({
        size: 500,
        price: '1.00',
        status: 'FILLED',
      });
    });

    it('is reflected in the portfolio', async () => {
      const userId = await fundedUser(10000);
      await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'MARKET',
        size: 5,
      }).expect(201);
      await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        price: '100.50',
        size: 9,
      }).expect(201);

      expect(await portfolio(userId)).toEqual({
        account_number: 'E2E',
        available: '4466.25', // 10000 - 5 * 925.85 - 9 * 100.50
        total_cash: '5370.75',
        total_value: '10000.00',
        assets: [
          {
            instrument_id: PAMP,
            ticker: 'PAMP',
            name: expect.any(String),
            shares: 5,
            value: '4629.25',
            yield: '0.00',
          },
        ],
      });
    });

    it('spends exactly the available cash and not a cent more', async () => {
      const userId = await fundedUser(1000);
      const exact = await place(userId, {
        instrument_id: ARS,
        side: 'CASH_OUT',
        type: 'MARKET',
        size: 1000,
      }).expect(201);
      expect(exact.body.status).toBe('FILLED');
      const over = await place(userId, {
        instrument_id: ARS,
        side: 'CASH_OUT',
        type: 'MARKET',
        size: 1,
      }).expect(201);
      expect(over.body.status).toBe('REJECTED');
    });
  });

  describe('rejected orders (201, persisted with a reason)', () => {
    it('BUY above the available cash keeps the price and the reason', async () => {
      const userId = await fundedUser(1000);
      const res = await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'MARKET',
        size: 2,
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'INSUFFICIENT_FUNDS',
        price: '925.85',
        size: 2,
      });

      const stored = (await rowsOf(userId)).find((r) => r.id === res.body.id);
      expect(stored).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'INSUFFICIENT_FUNDS',
        price: '925.85',
      });

      const p = await portfolio(userId);
      expect(p.total_cash).toBe('1000.00');
      expect(p.assets).toEqual([]);
    });

    it('a LIMIT BUY above the available cash is REJECTED, not NEW', async () => {
      const userId = await fundedUser(1000);
      const res = await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        size: 2,
        price: '600',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'INSUFFICIENT_FUNDS',
      });
    });

    it('SELL above the shares held, or of an instrument not held', async () => {
      const userId = await fundedUser(10000, { instrumentId: PAMP, size: 3 });
      const tooMany = await place(userId, {
        instrument_id: PAMP,
        side: 'SELL',
        type: 'MARKET',
        size: 4,
      }).expect(201);
      expect(tooMany.body).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'INSUFFICIENT_SHARES',
      });

      const notHeld = await place(userId, {
        instrument_id: BMA,
        side: 'SELL',
        type: 'MARKET',
        size: 1,
      }).expect(201);
      expect(notHeld.body).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'INSUFFICIENT_SHARES',
      });
      expect((await portfolio(userId)).assets).toHaveLength(1);
    });

    it('LIMIT SELLs cannot reserve the same shares twice', async () => {
      const userId = await fundedUser(10000, { instrumentId: PAMP, size: 10 });
      const sell = (size: number, type: 'LIMIT' | 'MARKET' = 'LIMIT') =>
        place(userId, {
          instrument_id: PAMP,
          side: 'SELL',
          type,
          size,
          ...(type === 'LIMIT' ? { price: '1000' } : {}),
        }).expect(201);

      expect((await sell(6)).body.status).toBe('NEW');
      const second = await sell(5);
      expect(second.body).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'INSUFFICIENT_SHARES',
      });
      expect((await sell(4)).body.status).toBe('NEW');
      // Everything is reserved now, even for a MARKET SELL.
      expect((await sell(1, 'MARKET')).body.status).toBe('REJECTED');

      // NEW orders do not change the positions.
      expect((await portfolio(userId)).assets[0].shares).toBe(10);
    });

    it('a CASH_OUT above the available cash, which a NEW BUY has reserved', async () => {
      const userId = await fundedUser(1000);
      await place(userId, {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        size: 4,
        price: '100',
      }).expect(201);

      const cashOut = (size: number) =>
        place(userId, {
          instrument_id: ARS,
          side: 'CASH_OUT',
          type: 'MARKET',
          size,
        }).expect(201);

      const over = await cashOut(601);
      expect(over.body).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'INSUFFICIENT_FUNDS',
      });
      expect((await cashOut(600)).body.status).toBe('FILLED');
    });
  });
});
