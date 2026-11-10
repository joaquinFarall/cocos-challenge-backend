import { D, toMoneyString } from './decimal';
import type { OrderSide, OrderStatus } from './enums';
import {
  availableCash,
  buildPortfolio,
  computePositions,
  LedgerInconsistencyError,
  positionYield,
  totalCash,
  type LedgerOrder,
} from './portfolio';

const ARS = 66;
const PAMP = 47;
const BMA = 31;
const METR = 54;

let nextId = 1;
function order(
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
    instrumentId,
    side,
    status,
    size,
    price: new D(price),
    datetime: new Date(datetime),
  };
}

describe('totalCash', () => {
  it('is 0 for an empty ledger', () => {
    expect(totalCash([]).toFixed(2)).toBe('0.00');
  });

  it('adds CASH_IN and SELL, subtracts CASH_OUT and BUY (FILLED only)', () => {
    const orders = [
      order('CASH_IN', ARS, 1000, '1'),
      order('BUY', PAMP, 10, '50'),
      order('SELL', PAMP, 4, '60'),
      order('CASH_OUT', ARS, 100, '1'),
    ];
    // 1000 - 500 + 240 - 100
    expect(totalCash(orders).toFixed(2)).toBe('640.00');
  });

  it('ignores NEW, CANCELLED and REJECTED orders', () => {
    const orders = [
      order('CASH_IN', ARS, 1000, '1'),
      order('BUY', PAMP, 10, '50', 'NEW'),
      order('BUY', PAMP, 10, '50', 'CANCELLED'),
      order('CASH_OUT', ARS, 5000, '1', 'REJECTED'),
      order('SELL', PAMP, 10, '50', 'NEW'),
    ];
    expect(totalCash(orders).toFixed(2)).toBe('1000.00');
  });
});

describe('availableCash', () => {
  it('subtracts the cash reserved by NEW BUY orders only', () => {
    const orders = [
      order('CASH_IN', ARS, 1000, '1'),
      order('BUY', PAMP, 2, '100', 'NEW'),
      order('SELL', PAMP, 5, '100', 'NEW'),
      order('BUY', PAMP, 9, '100', 'CANCELLED'),
      order('BUY', PAMP, 9, '100', 'REJECTED'),
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
      order('BUY', PAMP, 10, '100', 'FILLED', '2023-07-12T10:00:00Z'),
      order('SELL', PAMP, 5, '120', 'FILLED', '2023-07-12T11:00:00Z'),
      order('BUY', PAMP, 5, '200', 'FILLED', '2023-07-12T12:00:00Z'),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].shares).toBe(10);
    expect(positions[0].avgCost.toFixed(2)).toBe('150.00');
  });

  it('hides positions sold down to 0', () => {
    const positions = computePositions([
      order('BUY', PAMP, 10, '100', 'FILLED', '2023-07-12T10:00:00Z'),
      order('SELL', PAMP, 10, '110', 'FILLED', '2023-07-12T11:00:00Z'),
    ]);
    expect(positions).toEqual([]);
  });

  it('sorts by datetime, then id, regardless of input order', () => {
    const buy = order(
      'BUY',
      PAMP,
      10,
      '100',
      'FILLED',
      '2023-07-12T10:00:00Z',
      2,
    );
    const sell = order(
      'SELL',
      PAMP,
      10,
      '100',
      'FILLED',
      '2023-07-12T10:00:00Z',
      3,
    );
    const later = order(
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
      order('CASH_IN', ARS, 1000, '1'),
      order('BUY', PAMP, 10, '100', 'NEW'),
      order('BUY', PAMP, 10, '100', 'CANCELLED'),
      order('SELL', PAMP, 10, '100', 'REJECTED'),
    ]);
    expect(positions).toEqual([]);
  });

  it('throws when a FILLED SELL takes shares below 0', () => {
    expect(() =>
      computePositions([
        order('BUY', BMA, 20, '1540', 'FILLED', '2023-07-13T12:51:20Z'),
        order('SELL', BMA, 30, '1530', 'FILLED', '2023-07-13T15:13:20Z'),
      ]),
    ).toThrow(LedgerInconsistencyError);
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
    const orders = [order('BUY', PAMP, 1, '100')];
    expect(() =>
      buildPortfolio(orders, computePositions(orders), new Map()),
    ).toThrow(LedgerInconsistencyError);
  });

  describe('seed scenario (user 1, after the ADR-16 correction)', () => {
    const seed = (bmaSellStatus: OrderStatus): LedgerOrder[] => [
      order('CASH_IN', ARS, 1000000, '1', 'FILLED', '2023-07-12T12:11:20Z', 1),
      order('BUY', PAMP, 50, '930', 'FILLED', '2023-07-12T12:31:20Z', 2),
      order('BUY', PAMP, 50, '920', 'CANCELLED', '2023-07-12T14:21:20Z', 3),
      order('SELL', PAMP, 10, '940', 'FILLED', '2023-07-12T14:51:20Z', 4),
      order('BUY', 45, 50, '710', 'NEW', '2023-07-12T15:14:20Z', 5),
      order('SELL', PAMP, 100, '950', 'REJECTED', '2023-07-12T16:11:20Z', 6),
      order('BUY', BMA, 60, '1500', 'NEW', '2023-07-13T11:13:20Z', 7),
      order('CASH_OUT', ARS, 100000, '1', 'FILLED', '2023-07-13T12:31:20Z', 8),
      order('BUY', BMA, 20, '1540', 'FILLED', '2023-07-13T12:51:20Z', 9),
      order('BUY', METR, 500, '250', 'FILLED', '2023-07-13T14:11:20Z', 10),
      order('SELL', BMA, 30, '1530', bmaSellStatus, '2023-07-13T15:13:20Z', 11),
    ];
    // Latest seed closes (2023-07-14).
    const closes = new Map<number, D>([
      [PAMP, new D('925.85')],
      [BMA, new D('1502.80')],
      [METR, new D('229.50')],
    ]);

    it('matches the hardcoded cash, positions, values and yields', () => {
      const orders = seed('REJECTED');
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
      expect(() => computePositions(seed('FILLED'))).toThrow(
        LedgerInconsistencyError,
      );
    });
  });
});
