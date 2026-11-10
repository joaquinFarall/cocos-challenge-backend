import { D } from '../decimal';
import type { OrderSide, OrderStatus } from '../enums';
import type { LedgerOrder } from '../portfolio';

// Seed ids of the provided database.
export const ARS = 66;
export const PAMP = 47;
export const BMA = 31;
export const METR = 54;
export const LOMA = 45;

let nextId = 1;

/** A ledger order of user 1; defaults to a FILLED order with an auto id. */
export function ledgerOrder(
  side: OrderSide,
  instrumentId: number,
  size: number,
  price: string,
  status: OrderStatus = 'FILLED',
  datetime = '2023-07-12T12:00:00Z',
  id = nextId++,
): LedgerOrder {
  return {
    id,
    userId: 1,
    instrumentId,
    side,
    status,
    size,
    price: new D(price),
    datetime: new Date(datetime),
  };
}

/**
 * The seed orders of user 1 (ids 1-11). Order 11 is the oversold BMA SELL:
 * `REJECTED` after the ADR-16 correction, `FILLED` in the uncorrected seed.
 */
export function seedLedger(
  bmaSellStatus: OrderStatus = 'REJECTED',
): LedgerOrder[] {
  return [
    ledgerOrder(
      'CASH_IN',
      ARS,
      1000000,
      '1',
      'FILLED',
      '2023-07-12T12:11:20Z',
      1,
    ),
    ledgerOrder('BUY', PAMP, 50, '930', 'FILLED', '2023-07-12T12:31:20Z', 2),
    ledgerOrder('BUY', PAMP, 50, '920', 'CANCELLED', '2023-07-12T14:21:20Z', 3),
    ledgerOrder('SELL', PAMP, 10, '940', 'FILLED', '2023-07-12T14:51:20Z', 4),
    ledgerOrder('BUY', LOMA, 50, '710', 'NEW', '2023-07-12T15:14:20Z', 5),
    ledgerOrder(
      'SELL',
      PAMP,
      100,
      '950',
      'REJECTED',
      '2023-07-12T16:11:20Z',
      6,
    ),
    ledgerOrder('BUY', BMA, 60, '1500', 'NEW', '2023-07-13T11:13:20Z', 7),
    ledgerOrder(
      'CASH_OUT',
      ARS,
      100000,
      '1',
      'FILLED',
      '2023-07-13T12:31:20Z',
      8,
    ),
    ledgerOrder('BUY', BMA, 20, '1540', 'FILLED', '2023-07-13T12:51:20Z', 9),
    ledgerOrder('BUY', METR, 500, '250', 'FILLED', '2023-07-13T14:11:20Z', 10),
    ledgerOrder(
      'SELL',
      BMA,
      30,
      '1530',
      bmaSellStatus,
      '2023-07-13T15:13:20Z',
      11,
    ),
  ];
}
