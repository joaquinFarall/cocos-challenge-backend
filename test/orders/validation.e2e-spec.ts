import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp, createUser } from '../setup/app';
import { ARS, PAMP, NO_MARKETDATA, createOrderHelpers } from './helpers';

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

  const { place, rowsOf, fundedUser } = createOrderHelpers(() => app);

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
});
