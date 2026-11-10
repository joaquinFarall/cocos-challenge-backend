import { D, toMoneyString } from './decimal';
import {
  availableCash,
  availableShares,
  buildPortfolio,
  computePositions,
  LedgerInconsistencyError,
  positionYield,
  totalCash,
} from './portfolio';
import {
  ARS,
  BMA,
  ledgerOrder,
  METR,
  PAMP,
  seedLedger,
} from './testing/ledger-order.fixture';

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the function to throw');
}

describe('totalCash', () => {
  it('is 0 for an empty ledger', () => {
    expect(totalCash([]).toFixed(2)).toBe('0.00');
  });

  it('adds CASH_IN and SELL, subtracts CASH_OUT and BUY (FILLED only)', () => {
    const orders = [
      ledgerOrder('CASH_IN', ARS, 1000, '1'),
      ledgerOrder('BUY', PAMP, 10, '50'),
      ledgerOrder('SELL', PAMP, 4, '60'),
      ledgerOrder('CASH_OUT', ARS, 100, '1'),
    ];
    // 1000 - 500 + 240 - 100
    expect(totalCash(orders).toFixed(2)).toBe('640.00');
  });

  it('ignores NEW, CANCELLED and REJECTED orders', () => {
    const orders = [
      ledgerOrder('CASH_IN', ARS, 1000, '1'),
      ledgerOrder('BUY', PAMP, 10, '50', 'NEW'),
      ledgerOrder('BUY', PAMP, 10, '50', 'CANCELLED'),
      ledgerOrder('CASH_OUT', ARS, 5000, '1', 'REJECTED'),
      ledgerOrder('SELL', PAMP, 10, '50', 'NEW'),
    ];
    expect(totalCash(orders).toFixed(2)).toBe('1000.00');
  });
});

describe('availableCash', () => {
  it('subtracts the cash reserved by NEW BUY orders only', () => {
    const orders = [
      ledgerOrder('CASH_IN', ARS, 1000, '1'),
      ledgerOrder('BUY', PAMP, 2, '100', 'NEW'),
      ledgerOrder('SELL', PAMP, 5, '100', 'NEW'),
      ledgerOrder('BUY', PAMP, 9, '100', 'CANCELLED'),
      ledgerOrder('BUY', PAMP, 9, '100', 'REJECTED'),
    ];
    expect(availableCash(orders).toFixed(2)).toBe('800.00');
  });
});

describe('computePositions', () => {
  it('is empty for an empty ledger', () => {
    expect(computePositions([])).toEqual([]);
  });

  it('keeps the running average across sells (buy 10@100, sell 5, buy 5@200)', () => {
    const positions = computePositions([
      ledgerOrder('BUY', PAMP, 10, '100', 'FILLED', '2023-07-12T10:00:00Z'),
      ledgerOrder('SELL', PAMP, 5, '120', 'FILLED', '2023-07-12T11:00:00Z'),
      ledgerOrder('BUY', PAMP, 5, '200', 'FILLED', '2023-07-12T12:00:00Z'),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].shares).toBe(10);
    expect(positions[0].avgCost.toFixed(2)).toBe('150.00');
  });

  it('hides positions sold down to 0', () => {
    const positions = computePositions([
      ledgerOrder('BUY', PAMP, 10, '100', 'FILLED', '2023-07-12T10:00:00Z'),
      ledgerOrder('SELL', PAMP, 10, '110', 'FILLED', '2023-07-12T11:00:00Z'),
    ]);
    expect(positions).toEqual([]);
  });

  it('sorts by datetime, then id, regardless of input order', () => {
    const buy = ledgerOrder(
      'BUY',
      PAMP,
      10,
      '100',
      'FILLED',
      '2023-07-12T10:00:00Z',
      2,
    );
    const sell = ledgerOrder(
      'SELL',
      PAMP,
      10,
      '100',
      'FILLED',
      '2023-07-12T10:00:00Z',
      3,
    );
    const later = ledgerOrder(
      'BUY',
      PAMP,
      1,
      '100',
      'FILLED',
      '2023-07-12T09:00:00Z',
      9,
    );
    // Sorted: later(9, 09:00) -> buy(2) -> sell(3): ends with 1 share.
    const positions = computePositions([sell, buy, later]);
    expect(positions.map((p) => p.shares)).toEqual([1]);
  });

  it('ignores cash orders and non-FILLED orders', () => {
    const positions = computePositions([
      ledgerOrder('CASH_IN', ARS, 1000, '1'),
      ledgerOrder('BUY', PAMP, 10, '100', 'NEW'),
      ledgerOrder('BUY', PAMP, 10, '100', 'CANCELLED'),
      ledgerOrder('SELL', PAMP, 10, '100', 'REJECTED'),
    ]);
    expect(positions).toEqual([]);
  });

  it('throws when a FILLED SELL takes shares below 0', () => {
    const thrown = catchError(() =>
      computePositions([
        ledgerOrder(
          'BUY',
          BMA,
          20,
          '1540',
          'FILLED',
          '2023-07-13T12:51:20Z',
          9,
        ),
        ledgerOrder(
          'SELL',
          BMA,
          30,
          '1530',
          'FILLED',
          '2023-07-13T15:13:20Z',
          11,
        ),
      ]),
    );
    expect(thrown).toBeInstanceOf(LedgerInconsistencyError);
    expect((thrown as LedgerInconsistencyError).context).toEqual({
      userId: 1,
      orderId: 11,
      instrumentId: BMA,
    });
  });
});

describe('positionYield', () => {
  it('is positive above the average cost (PAMP 40@930 + 20@950, close 960)', () => {
    const avg = new D(40 * 930 + 20 * 950).div(60);
    expect(toMoneyString(positionYield(60, avg, new D('960')))).toBe('2.49');
  });

  it('is negative below the average cost (close 900)', () => {
    const avg = new D(40 * 930 + 20 * 950).div(60);
    expect(toMoneyString(positionYield(60, avg, new D('900')))).toBe('-3.91');
  });
});

describe('toMoneyString', () => {
  it('rounds half up to 2 decimals', () => {
    expect(toMoneyString(new D('1.005'))).toBe('1.01');
    expect(toMoneyString(new D('-1.005'))).toBe('-1.01');
    expect(toMoneyString(new D('930'))).toBe('930.00');
  });
});

describe('buildPortfolio', () => {
  it('returns zeros for an empty ledger', () => {
    const result = buildPortfolio([], [], new Map());
    expect(toMoneyString(result.totalCash)).toBe('0.00');
    expect(toMoneyString(result.available)).toBe('0.00');
    expect(toMoneyString(result.totalValue)).toBe('0.00');
    expect(result.positions).toEqual([]);
  });

  it('throws when a held instrument has no close', () => {
    const orders = [ledgerOrder('BUY', PAMP, 1, '100')];
    const thrown = catchError(() =>
      buildPortfolio(orders, computePositions(orders), new Map()),
    );
    expect(thrown).toBeInstanceOf(LedgerInconsistencyError);
    expect((thrown as LedgerInconsistencyError).context).toEqual({
      userId: 1,
      instrumentId: PAMP,
    });
  });

  describe('seed scenario (user 1, after the ADR-16 correction)', () => {
    // Latest seed closes (2023-07-14).
    const closes = new Map<number, D>([
      [PAMP, new D('925.85')],
      [BMA, new D('1502.80')],
      [METR, new D('229.50')],
    ]);

    it('matches the hardcoded cash, positions, values and yields', () => {
      const orders = seedLedger('REJECTED');
      const result = buildPortfolio(orders, computePositions(orders), closes);

      expect(toMoneyString(result.totalCash)).toBe('707100.00');
      expect(toMoneyString(result.available)).toBe('581600.00');
      expect(toMoneyString(result.totalValue)).toBe('888940.00');

      const byId = new Map(result.positions.map((p) => [p.instrumentId, p]));
      expect(byId.size).toBe(3);

      const pamp = byId.get(PAMP)!;
      expect(pamp.shares).toBe(40);
      expect(pamp.avgCost.toFixed(2)).toBe('930.00');
      expect(toMoneyString(pamp.value)).toBe('37034.00');
      expect(toMoneyString(pamp.yieldPct)).toBe('-0.45');

      const bma = byId.get(BMA)!;
      expect(bma.shares).toBe(20);
      expect(bma.avgCost.toFixed(2)).toBe('1540.00');
      expect(toMoneyString(bma.value)).toBe('30056.00');
      expect(toMoneyString(bma.yieldPct)).toBe('-2.42');

      const metr = byId.get(METR)!;
      expect(metr.shares).toBe(500);
      expect(metr.avgCost.toFixed(2)).toBe('250.00');
      expect(toMoneyString(metr.value)).toBe('114750.00');
      expect(toMoneyString(metr.yieldPct)).toBe('-8.20');
    });

    it('throws on the uncorrected seed (BMA SELL still FILLED)', () => {
      expect(() => computePositions(seedLedger('FILLED'))).toThrow(
        LedgerInconsistencyError,
      );
    });
  });
});

describe('availableShares', () => {
  it('is FILLED buys − FILLED sells − NEW sells of that instrument', () => {
    const orders = [
      ledgerOrder('BUY', PAMP, 50, '100'),
      ledgerOrder('SELL', PAMP, 10, '100'),
      ledgerOrder('SELL', PAMP, 15, '100', 'NEW'),
      ledgerOrder('BUY', PAMP, 99, '100', 'NEW'),
      ledgerOrder('BUY', PAMP, 99, '100', 'CANCELLED'),
      ledgerOrder('SELL', PAMP, 99, '100', 'REJECTED'),
      ledgerOrder('BUY', BMA, 7, '100'),
    ];
    expect(availableShares(orders, PAMP)).toBe(25);
    expect(availableShares(orders, BMA)).toBe(7);
    expect(availableShares(orders, METR)).toBe(0);
  });

  it('does not throw on an inconsistent ledger', () => {
    const orders = [ledgerOrder('SELL', PAMP, 5, '100')];
    expect(availableShares(orders, PAMP)).toBe(-5);
  });
});
