import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createUser } from '../setup/app';

// Seed ids and latest closes (2023-07-14).
export const ARS = 66;
export const PAMP = 47; // 925.85
export const BMA = 31; // 1502.80
export const NO_MARKETDATA = 3; // PGR

export interface OrderRow {
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

/** Request and ledger helpers for the order e2e tests, bound to a running app. */
export function createOrderHelpers(getApp: () => INestApplication) {
  const place = (userId: number | string, body: unknown) =>
    request(getApp().getHttpServer())
      .post(`/users/${userId}/orders`)
      .send(body as object);

  const portfolio = async (userId: number) =>
    (
      await request(getApp().getHttpServer())
        .get(`/users/${userId}/portfolio`)
        .expect(200)
    ).body;

  const rowsOf = (userId: number): Promise<OrderRow[]> =>
    getApp()
      .get(DataSource)
      .query('SELECT * FROM orders WHERE userid = $1 ORDER BY id', [userId]);

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
    const userId = await createUser(getApp());
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

  return { place, portfolio, rowsOf, cashIn, fundedUser };
}
