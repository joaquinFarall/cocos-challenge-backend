import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createUser } from './setup/app';

// Seed ids and latest closes (2023-07-14).
const ARS = 66;
const PAMP = 47; // 925.85
const BMA = 31; // 1502.80
const NO_MARKETDATA = 3; // PGR

interface OrderRow {
  id: number;
  userid: number;
  instrumentid: number;
  side: string;
  size: number;
  price: string;
  type: string;
  status: string;
  rejection_reason: string | null;
}

describe('POST /users/:id/orders', () => {
  let app: INestApplication;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const place = (userId: number | string, body: unknown) =>
    request(app.getHttpServer())
      .post(`/users/${userId}/orders`)
      .send(body as object);

  const portfolio = async (userId: number) =>
    (
      await request(app.getHttpServer())
        .get(`/users/${userId}/portfolio`)
        .expect(200)
    ).body;

  const rowsOf = (userId: number): Promise<OrderRow[]> =>
    db.query('SELECT * FROM orders WHERE userid = $1 ORDER BY id', [userId]);

  async function cashIn(userId: number, size: number) {
    await place(userId, {
      instrument_id: ARS,
      side: 'CASH_IN',
      type: 'MARKET',
      size,
    }).expect(201);
  }

  /** A user with `cash` pesos and, if asked, shares bought at the last close. */
  async function fundedUser(
    cash: number,
    shares?: { instrumentId: number; size: number },
  ) {
    const userId = await createUser(app);
    await cashIn(userId, cash);
    if (shares) {
      const res = await place(userId, {
        instrument_id: shares.instrumentId,
        side: 'BUY',
        type: 'MARKET',
        size: shares.size,
      }).expect(201);
      expect(res.body.status).toBe('FILLED');
    }
    return userId;
  }

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

  describe('400 bad request (nothing persisted)', () => {
    const valid = { instrument_id: PAMP, side: 'BUY', type: 'MARKET', size: 1 };

    it.each<[string, unknown, string]>([
      ['lowercase side', { ...valid, side: 'buy' }, 'side'],
      ['lowercase type', { ...valid, type: 'market' }, 'type'],
      [
        'instrument_id as string',
        { ...valid, instrument_id: '47' },
        'instrument_id',
      ],
      [
        'missing instrument_id',
        { side: 'BUY', type: 'MARKET', size: 1 },
        'instrument_id',
      ],
      ['size 0', { ...valid, size: 0 }, 'size'],
      ['fractional size', { ...valid, size: 1.5 }, 'size'],
      ['size above INT', { ...valid, size: 2147483648 }, 'size'],
      ['LIMIT without price', { ...valid, type: 'LIMIT' }, 'price'],
      ['MARKET with price', { ...valid, price: '100' }, 'price'],
      [
        'price with 3 decimals',
        { ...valid, type: 'LIMIT', price: '1.001' },
        'price',
      ],
      ['numeric price', { ...valid, type: 'LIMIT', price: 100 }, 'price'],
      [
        'price above NUMERIC(10,2)',
        { ...valid, type: 'LIMIT', price: '100000000' },
        'price',
      ],
      ['size and amount together', { ...valid, amount: '1000' }, 'amount'],
      [
        'neither size nor amount',
        { instrument_id: PAMP, side: 'BUY', type: 'MARKET' },
        'amount',
      ],
      [
        'amount with 3 decimals',
        { instrument_id: PAMP, side: 'BUY', type: 'MARKET', amount: '1.001' },
        'amount',
      ],
      [
        'cash LIMIT',
        {
          instrument_id: ARS,
          side: 'CASH_IN',
          type: 'LIMIT',
          price: '1',
          size: 1,
        },
        'type',
      ],
      ['unknown property', { ...valid, sise: 1 }, 'sise'],
    ])('%s', async (_name, body, field) => {
      const userId = await createUser(app);
      const res = await place(userId, body).expect(400);
      expect(res.body).toMatchObject({
        status_code: 400,
        error: 'BAD_REQUEST',
        message: 'Validation failed',
      });
      expect(res.body.details).toContainEqual({
        field,
        message: expect.any(String),
      });
      expect(await rowsOf(userId)).toHaveLength(0);
    });

    it.each([[[]], [null], ['text']])(
      'a body that is not an object: %j',
      async (body) => {
        const userId = await createUser(app);
        const res = await place(userId, body).expect(400);
        expect(res.body).toMatchObject({
          status_code: 400,
          error: 'BAD_REQUEST',
        });
        expect(await rowsOf(userId)).toHaveLength(0);
      },
    );

    it('an empty body reports every missing field', async () => {
      const userId = await createUser(app);
      const res = await place(userId, {}).expect(400);
      const fields = res.body.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining(['instrument_id', 'side', 'type', 'amount']),
      );
    });

    it.each(['0', '-1', '01', '1.0', 'abc', '2147483648'])(
      'a malformed user id %j',
      async (id) => {
        const res = await place(id, valid).expect(400);
        expect(res.body).toMatchObject({
          status_code: 400,
          error: 'BAD_REQUEST',
        });
      },
    );
  });

  describe('404 user not found', () => {
    it('is checked after the body (400 first) and before the business rules', async () => {
      const unknownUser = 2147483647;
      const valid = {
        instrument_id: PAMP,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      };

      await place(unknownUser, { ...valid, side: 'buy' }).expect(400);

      const res = await place(unknownUser, valid).expect(404);
      expect(res.body).toEqual({
        status_code: 404,
        error: 'USER_NOT_FOUND',
        message: `User ${unknownUser} not found`,
      });

      // Even an order that would be a 422 for an existing user.
      const rule = await place(unknownUser, {
        ...valid,
        instrument_id: 9999,
      }).expect(404);
      expect(rule.body.error).toBe('USER_NOT_FOUND');

      const rows = await db.query('SELECT 1 FROM orders WHERE userid = $1', [
        unknownUser,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('422 business rule violated (nothing persisted)', () => {
    it.each<[string, string, unknown]>([
      [
        'INSTRUMENT_NOT_FOUND',
        'unknown instrument',
        { instrument_id: 9999, side: 'BUY', type: 'MARKET', size: 1 },
      ],
      [
        'SIDE_INSTRUMENT_MISMATCH',
        'BUY on ARS',
        { instrument_id: ARS, side: 'BUY', type: 'MARKET', size: 1 },
      ],
      [
        'SIDE_INSTRUMENT_MISMATCH',
        'SELL on ARS',
        { instrument_id: ARS, side: 'SELL', type: 'MARKET', size: 1 },
      ],
      [
        'SIDE_INSTRUMENT_MISMATCH',
        'CASH_IN on a stock',
        { instrument_id: PAMP, side: 'CASH_IN', type: 'MARKET', size: 1 },
      ],
      [
        'SIDE_INSTRUMENT_MISMATCH',
        'CASH_OUT on a stock',
        { instrument_id: PAMP, side: 'CASH_OUT', type: 'MARKET', size: 1 },
      ],
      [
        'NO_MARKET_DATA',
        'MARKET on an instrument without marketdata',
        { instrument_id: NO_MARKETDATA, side: 'BUY', type: 'MARKET', size: 1 },
      ],
      [
        'NO_MARKET_DATA',
        'LIMIT on an instrument without marketdata',
        {
          instrument_id: NO_MARKETDATA,
          side: 'BUY',
          type: 'LIMIT',
          size: 1,
          price: '100',
        },
      ],
      [
        'ZERO_SHARES',
        'MARKET amount below one share',
        { instrument_id: PAMP, side: 'BUY', type: 'MARKET', amount: '925.84' },
      ],
      [
        'ZERO_SHARES',
        'LIMIT amount below one share',
        {
          instrument_id: PAMP,
          side: 'BUY',
          type: 'LIMIT',
          price: '100',
          amount: '99.99',
        },
      ],
      [
        'SIZE_OUT_OF_RANGE',
        'an amount that results in more than INT shares',
        {
          instrument_id: PAMP,
          side: 'BUY',
          type: 'LIMIT',
          price: '0.01',
          amount: '99999999.99',
        },
      ],
    ])('%s: %s', async (code, _name, body) => {
      const userId = await fundedUser(1000);
      const before = (await rowsOf(userId)).length;

      const res = await place(userId, body).expect(422);
      expect(res.body).toEqual({
        status_code: 422,
        error: code,
        message: expect.any(String),
      });
      expect(await rowsOf(userId)).toHaveLength(before);
    });

    it('checks the rules before the balance: no funds does not turn a 422 into REJECTED', async () => {
      const userId = await createUser(app); // no cash at all
      await place(userId, {
        instrument_id: NO_MARKETDATA,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      }).expect(422);
      expect(await rowsOf(userId)).toHaveLength(0);
    });
  });

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
