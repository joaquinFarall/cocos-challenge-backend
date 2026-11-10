import { D } from './decimal';
import type { OrderSide, OrderStatus } from './enums';
import {
  checkOrderRules,
  decideOrder,
  resolvePrice,
  resolveSize,
  type InstrumentInfo,
} from './orders';
import type { LedgerOrder } from './portfolio';

const ARS = 66;
const PAMP = 47;
const BMA = 31;
const METR = 54;
const NO_PRICE = 3;

const ars: InstrumentInfo = { id: ARS, type: 'MONEDA' };
const pamp: InstrumentInfo = { id: PAMP, type: 'ACCIONES' };

let nextId = 1;
function ledgerOrder(
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

describe('checkOrderRules', () => {
  const close = new D('925.85');

  it('accepts a BUY of an instrument with prices', () => {
    expect(
      checkOrderRules({
        side: 'BUY',
        instrumentId: PAMP,
        instrument: pamp,
        lastClose: close,
      }),
    ).toBeNull();
  });

  it('accepts cash orders on ARS without marketdata', () => {
    for (const side of ['CASH_IN', 'CASH_OUT'] as const) {
      expect(
        checkOrderRules({
          side,
          instrumentId: ARS,
          instrument: ars,
          lastClose: null,
        }),
      ).toBeNull();
    }
  });

  it('rejects an unknown instrument', () => {
    expect(
      checkOrderRules({
        side: 'BUY',
        instrumentId: 999,
        instrument: null,
        lastClose: null,
      }),
    ).toMatchObject({ code: 'INSTRUMENT_NOT_FOUND' });
  });

  it.each(['BUY', 'SELL'] as const)('rejects %s on ARS', (side) => {
    expect(
      checkOrderRules({
        side,
        instrumentId: ARS,
        instrument: ars,
        lastClose: null,
      }),
    ).toMatchObject({ code: 'SIDE_INSTRUMENT_MISMATCH' });
  });

  it.each(['CASH_IN', 'CASH_OUT'] as const)(
    'rejects %s on a non-ARS instrument',
    (side) => {
      expect(
        checkOrderRules({
          side,
          instrumentId: PAMP,
          instrument: pamp,
          lastClose: close,
        }),
      ).toMatchObject({ code: 'SIDE_INSTRUMENT_MISMATCH' });
    },
  );

  it.each(['BUY', 'SELL'] as const)('rejects %s without marketdata', (side) => {
    expect(
      checkOrderRules({
        side,
        instrumentId: NO_PRICE,
        instrument: { id: NO_PRICE, type: 'ACCIONES' },
        lastClose: null,
      }),
    ).toMatchObject({ code: 'NO_MARKET_DATA' });
  });

  it('checks the instrument before the side and the side before the prices', () => {
    expect(
      checkOrderRules({
        side: 'CASH_IN',
        instrumentId: 999,
        instrument: null,
        lastClose: null,
      }),
    ).toMatchObject({ code: 'INSTRUMENT_NOT_FOUND' });
    expect(
      checkOrderRules({
        side: 'CASH_IN',
        instrumentId: NO_PRICE,
        instrument: { id: NO_PRICE, type: 'ACCIONES' },
        lastClose: null,
      }),
    ).toMatchObject({ code: 'SIDE_INSTRUMENT_MISMATCH' });
  });
});

describe('resolvePrice', () => {
  const close = new D('925.85');
  const limit = new D('900.10');

  it('forces cash orders to 1', () => {
    expect(
      resolvePrice({
        type: 'MARKET',
        side: 'CASH_IN',
        requestedPrice: null,
        lastClose: null,
      }).toFixed(2),
    ).toBe('1.00');
  });

  it('uses the last close for MARKET', () => {
    expect(
      resolvePrice({
        type: 'MARKET',
        side: 'BUY',
        requestedPrice: null,
        lastClose: close,
      }).toFixed(2),
    ).toBe('925.85');
  });

  it('uses the requested price for LIMIT, not the close', () => {
    expect(
      resolvePrice({
        type: 'LIMIT',
        side: 'SELL',
        requestedPrice: limit,
        lastClose: close,
      }).toFixed(2),
    ).toBe('900.10');
  });

  it('throws when the price it needs is missing', () => {
    expect(() =>
      resolvePrice({
        type: 'MARKET',
        side: 'BUY',
        requestedPrice: null,
        lastClose: null,
      }),
    ).toThrow();
    expect(() =>
      resolvePrice({
        type: 'LIMIT',
        side: 'BUY',
        requestedPrice: null,
        lastClose: close,
      }),
    ).toThrow();
  });
});

describe('resolveSize', () => {
  it('uses an exact size as is', () => {
    expect(resolveSize({ size: 7 }, new D('100'))).toEqual({ size: 7 });
  });

  it('floors amount / price', () => {
    expect(resolveSize({ amount: new D('1000') }, new D('300'))).toEqual({
      size: 3,
    });
    expect(resolveSize({ amount: new D('899.99') }, new D('300'))).toEqual({
      size: 2,
    });
  });

  it('buys exactly one share when the amount equals the price', () => {
    expect(resolveSize({ amount: new D('925.85') }, new D('925.85'))).toEqual({
      size: 1,
    });
  });

  it('does not lose a share to rounding (0.30 / 0.10)', () => {
    expect(resolveSize({ amount: new D('0.30') }, new D('0.10'))).toEqual({
      size: 3,
    });
  });

  it('is a ZERO_SHARES violation when the amount does not buy one share', () => {
    expect(
      resolveSize({ amount: new D('925.84') }, new D('925.85')),
    ).toMatchObject({
      violation: { code: 'ZERO_SHARES' },
    });
  });

  it('is a SIZE_OUT_OF_RANGE violation above the INT maximum', () => {
    expect(
      resolveSize({ amount: new D('99999999.99') }, new D('0.01')),
    ).toMatchObject({
      violation: { code: 'SIZE_OUT_OF_RANGE' },
    });
  });

  it('accepts exactly the INT maximum', () => {
    expect(
      resolveSize({ amount: new D('21474836.47') }, new D('0.01')),
    ).toEqual({
      size: 2147483647,
    });
    expect(
      resolveSize({ amount: new D('21474836.48') }, new D('0.01')),
    ).toMatchObject({
      violation: { code: 'SIZE_OUT_OF_RANGE' },
    });
  });

  it('throws when neither size nor amount is given', () => {
    expect(() => resolveSize({}, new D('1'))).toThrow();
  });
});

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
    const seed: LedgerOrder[] = [
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
      ledgerOrder(
        'BUY',
        PAMP,
        50,
        '920',
        'CANCELLED',
        '2023-07-12T14:21:20Z',
        3,
      ),
      ledgerOrder('SELL', PAMP, 10, '940', 'FILLED', '2023-07-12T14:51:20Z', 4),
      ledgerOrder('BUY', 45, 50, '710', 'NEW', '2023-07-12T15:14:20Z', 5),
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
      ledgerOrder(
        'BUY',
        METR,
        500,
        '250',
        'FILLED',
        '2023-07-13T14:11:20Z',
        10,
      ),
      ledgerOrder(
        'SELL',
        BMA,
        30,
        '1530',
        'REJECTED',
        '2023-07-13T15:13:20Z',
        11,
      ),
    ];

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
