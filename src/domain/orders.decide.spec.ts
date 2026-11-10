import { D } from './decimal';
import { decideOrder } from './orders';
import {
  ARS,
  BMA,
  ledgerOrder,
  PAMP,
  seedLedger,
} from './testing/ledger-order.fixture';

describe('decideOrder', () => {
  const buy = (
    size: number,
    price: string,
    type: 'MARKET' | 'LIMIT' = 'MARKET',
  ) => ({
    side: 'BUY' as const,
    type,
    instrumentId: PAMP,
    size,
    price: new D(price),
  });
  const sell = (
    size: number,
    type: 'MARKET' | 'LIMIT' = 'MARKET',
    instrumentId = PAMP,
  ) => ({
    side: 'SELL' as const,
    type,
    instrumentId,
    size,
    price: new D('100'),
  });
  const cash = (side: 'CASH_IN' | 'CASH_OUT', size: number) => ({
    side,
    type: 'MARKET' as const,
    instrumentId: ARS,
    size,
    price: new D(1),
  });

  describe('BUY', () => {
    const ledger = [ledgerOrder('CASH_IN', ARS, 1000, '1')];

    it('MARKET with enough cash is FILLED', () => {
      expect(decideOrder(buy(10, '100'), ledger)).toEqual({
        status: 'FILLED',
        rejectionReason: null,
      });
    });

    it('LIMIT with enough cash is NEW', () => {
      expect(decideOrder(buy(10, '100', 'LIMIT'), ledger)).toEqual({
        status: 'NEW',
        rejectionReason: null,
      });
    });

    it('passes with exactly the available cash', () => {
      expect(decideOrder(buy(10, '100'), ledger).status).toBe('FILLED');
    });

    it('is REJECTED one cent above the available cash', () => {
      expect(decideOrder(buy(1, '1000.01'), ledger)).toEqual({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_FUNDS',
      });
    });

    it('is REJECTED for any type, with an empty ledger', () => {
      for (const type of ['MARKET', 'LIMIT'] as const) {
        expect(decideOrder(buy(1, '1', type), [])).toEqual({
          status: 'REJECTED',
          rejectionReason: 'INSUFFICIENT_FUNDS',
        });
      }
    });

    it('counts cash reserved by NEW BUYs, not by NEW SELLs or CANCELLED ones', () => {
      const reserved = [
        ...ledger,
        ledgerOrder('BUY', PAMP, 6, '100', 'NEW'),
        ledgerOrder('SELL', PAMP, 50, '100', 'NEW'),
        ledgerOrder('BUY', PAMP, 50, '100', 'CANCELLED'),
        ledgerOrder('BUY', PAMP, 50, '100', 'REJECTED'),
      ];
      // available = 1000 - 600
      expect(decideOrder(buy(4, '100'), reserved).status).toBe('FILLED');
      expect(decideOrder(buy(5, '100'), reserved)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_FUNDS',
      });
    });

    it('uses cash after FILLED buys and sells', () => {
      const traded = [
        ...ledger,
        ledgerOrder('BUY', PAMP, 5, '100'),
        ledgerOrder('SELL', PAMP, 2, '120'),
      ];
      // 1000 - 500 + 240
      expect(decideOrder(buy(7, '100'), traded).status).toBe('FILLED');
      expect(decideOrder(buy(8, '100'), traded).status).toBe('REJECTED');
    });
  });

  describe('SELL', () => {
    const ledger = [ledgerOrder('BUY', PAMP, 10, '100')];

    it('MARKET with enough shares is FILLED, LIMIT is NEW', () => {
      expect(decideOrder(sell(10), ledger).status).toBe('FILLED');
      expect(decideOrder(sell(10, 'LIMIT'), ledger).status).toBe('NEW');
    });

    it('is REJECTED with one share more than held', () => {
      expect(decideOrder(sell(11), ledger)).toEqual({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_SHARES',
      });
    });

    it('is REJECTED when the instrument is not held', () => {
      expect(decideOrder(sell(1, 'MARKET', BMA), ledger)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_SHARES',
      });
    });

    it('shares reserved by a NEW SELL cannot be sold again', () => {
      const reserved = [...ledger, ledgerOrder('SELL', PAMP, 6, '100', 'NEW')];
      expect(decideOrder(sell(4, 'LIMIT'), reserved).status).toBe('NEW');
      expect(decideOrder(sell(5, 'LIMIT'), reserved)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_SHARES',
      });
    });

    it('does not count shares of a NEW BUY', () => {
      const pending = [ledgerOrder('BUY', PAMP, 10, '100', 'NEW')];
      expect(decideOrder(sell(1), pending).status).toBe('REJECTED');
    });

    it('does not need cash', () => {
      expect(decideOrder(sell(10), ledger).status).toBe('FILLED');
    });
  });

  describe('cash orders', () => {
    const ledger = [ledgerOrder('CASH_IN', ARS, 1000, '1')];

    it('CASH_IN is always FILLED, even on an empty ledger', () => {
      expect(decideOrder(cash('CASH_IN', 5000), [])).toEqual({
        status: 'FILLED',
        rejectionReason: null,
      });
    });

    it('CASH_OUT up to the available cash is FILLED', () => {
      expect(decideOrder(cash('CASH_OUT', 1000), ledger).status).toBe('FILLED');
    });

    it('CASH_OUT above the available cash is REJECTED INSUFFICIENT_FUNDS', () => {
      expect(decideOrder(cash('CASH_OUT', 1001), ledger)).toEqual({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_FUNDS',
      });
    });

    it('CASH_OUT cannot spend cash reserved by a NEW BUY', () => {
      const reserved = [...ledger, ledgerOrder('BUY', PAMP, 4, '100', 'NEW')];
      expect(decideOrder(cash('CASH_OUT', 600), reserved).status).toBe(
        'FILLED',
      );
      expect(decideOrder(cash('CASH_OUT', 601), reserved).status).toBe(
        'REJECTED',
      );
    });
  });

  describe('seed scenario (user 1, after the ADR-16 correction)', () => {
    const seed = seedLedger();

    it('can spend exactly the 581600 available, not a cent more', () => {
      expect(decideOrder(buy(1, '581600'), seed).status).toBe('FILLED');
      expect(decideOrder(buy(1, '581600.01'), seed)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_FUNDS',
      });
    });

    it('can sell the 40 PAMP and 20 BMA it holds, not one more', () => {
      expect(decideOrder(sell(40), seed).status).toBe('FILLED');
      expect(decideOrder(sell(41), seed).status).toBe('REJECTED');
      expect(decideOrder(sell(20, 'MARKET', BMA), seed).status).toBe('FILLED');
      expect(decideOrder(sell(21, 'MARKET', BMA), seed).status).toBe(
        'REJECTED',
      );
    });

    it('cannot sell the BMA shares of the NEW BUY (not filled yet)', () => {
      expect(decideOrder(sell(60, 'MARKET', BMA), seed).status).toBe(
        'REJECTED',
      );
    });
  });
});
