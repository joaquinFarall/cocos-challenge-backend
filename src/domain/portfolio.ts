import { D } from './decimal';
import type { OrderSide, OrderStatus } from './enums';

/** The fields of an order the portfolio needs. The Order entity satisfies it. */
export interface LedgerOrder {
  id: number;
  instrumentId: number;
  side: OrderSide;
  status: OrderStatus;
  size: number;
  price: D;
  datetime: Date;
}

export interface Position {
  instrumentId: number;
  shares: number;
  avgCost: D;
}

export interface PortfolioPosition extends Position {
  value: D;
  yieldPct: D;
}

export interface Portfolio {
  totalCash: D;
  available: D;
  totalValue: D;
  positions: PortfolioPosition[];
}

/** The ledger contradicts itself (e.g. a FILLED SELL of shares never held). */
export class LedgerInconsistencyError extends Error {}

const amount = (order: LedgerOrder): D => order.price.mul(order.size);

/** Σ FILLED (CASH_IN + SELL − CASH_OUT − BUY) of size × price (ADR-10). */
export function totalCash(orders: readonly LedgerOrder[]): D {
  let total = new D(0);
  for (const order of orders) {
    if (order.status !== 'FILLED') continue;
    if (order.side === 'CASH_IN' || order.side === 'SELL') {
      total = total.plus(amount(order));
    } else {
      total = total.minus(amount(order));
    }
  }
  return total;
}

/** total_cash minus the cash reserved by NEW BUY orders (ADR-10). */
export function availableCash(orders: readonly LedgerOrder[]): D {
  let reserved = new D(0);
  for (const order of orders) {
    if (order.status === 'NEW' && order.side === 'BUY') {
      reserved = reserved.plus(amount(order));
    }
  }
  return totalCash(orders).minus(reserved);
}

/**
 * Held shares with a running weighted-average cost over FILLED BUY/SELL orders
 * sorted by `datetime, id`. A BUY updates the average; a SELL keeps it
 * (ADR-11). Positions with 0 shares are omitted.
 */
export function computePositions(orders: readonly LedgerOrder[]): Position[] {
  const sorted = orders
    .filter(
      (o) => o.status === 'FILLED' && (o.side === 'BUY' || o.side === 'SELL'),
    )
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime() || a.id - b.id);

  const byInstrument = new Map<number, Position>();
  for (const order of sorted) {
    const current = byInstrument.get(order.instrumentId) ?? {
      instrumentId: order.instrumentId,
      shares: 0,
      avgCost: new D(0),
    };
    if (order.side === 'BUY') {
      const shares = current.shares + order.size;
      current.avgCost = current.avgCost
        .mul(current.shares)
        .plus(amount(order))
        .div(shares);
      current.shares = shares;
    } else {
      const shares = current.shares - order.size;
      if (shares < 0) {
        throw new LedgerInconsistencyError(
          `Order ${order.id} sells ${order.size} of instrument ${order.instrumentId} but only ${current.shares} are held`,
        );
      }
      current.shares = shares;
    }
    byInstrument.set(order.instrumentId, current);
  }

  return [...byInstrument.values()].filter((p) => p.shares > 0);
}

/** Unrealized yield in percent, not rounded. Needs shares > 0 and avgCost > 0. */
export function positionYield(shares: number, avgCost: D, lastClose: D): D {
  const cost = avgCost.mul(shares);
  return lastClose.mul(shares).minus(cost).div(cost).mul(100);
}

/**
 * Cash, valuation and yield per position. `positions` comes from
 * `computePositions` (the caller needs it to know which closes to load).
 */
export function buildPortfolio(
  orders: readonly LedgerOrder[],
  positions: readonly Position[],
  lastCloses: ReadonlyMap<number, D>,
): Portfolio {
  const cash = totalCash(orders);
  let totalValue = cash;
  const valued = positions.map((position): PortfolioPosition => {
    const close = lastCloses.get(position.instrumentId);
    if (!close) {
      throw new LedgerInconsistencyError(
        `No market price for held instrument ${position.instrumentId}`,
      );
    }
    const value = close.mul(position.shares);
    totalValue = totalValue.plus(value);
    return {
      ...position,
      value,
      yieldPct: positionYield(position.shares, position.avgCost, close),
    };
  });
  return {
    totalCash: cash,
    available: availableCash(orders),
    totalValue,
    positions: valued,
  };
}
