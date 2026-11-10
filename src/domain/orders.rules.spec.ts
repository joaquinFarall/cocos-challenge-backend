import { D } from './decimal';
import {
  checkOrderRules,
  resolvePrice,
  resolveSize,
  type InstrumentInfo,
} from './orders';
import { ARS, PAMP } from './testing/ledger-order.fixture';

const NO_PRICE = 3; // PGR: no marketdata in the seed

const ars: InstrumentInfo = { id: ARS, type: 'MONEDA' };
const pamp: InstrumentInfo = { id: PAMP, type: 'ACCIONES' };

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
