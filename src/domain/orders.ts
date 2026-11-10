import { D } from './decimal';
import type {
  InstrumentType,
  OrderSide,
  OrderStatus,
  OrderType,
  RejectionReason,
} from './enums';
import { availableCash, availableShares, type LedgerOrder } from './portfolio';

const INT_MAX = 2147483647;

export type OrderRuleCode =
  | 'INSTRUMENT_NOT_FOUND'
  | 'SIDE_INSTRUMENT_MISMATCH'
  | 'NO_MARKET_DATA'
  | 'ZERO_SHARES'
  | 'SIZE_OUT_OF_RANGE';

export interface OrderRuleViolation {
  code: OrderRuleCode;
  message: string;
}

export interface InstrumentInfo {
  id: number;
  type: InstrumentType | null;
}

const isCashSide = (side: OrderSide) =>
  side === 'CASH_IN' || side === 'CASH_OUT';

/**
 * The instrument must exist, cash sides need the
 * ARS instrument (and the other way round), and non-cash orders need a price
 * to work with.
 */
export function checkOrderRules(input: {
  side: OrderSide;
  instrumentId: number;
  instrument: InstrumentInfo | null;
  lastClose: D | null;
}): OrderRuleViolation | null {
  const { side, instrumentId, instrument, lastClose } = input;
  if (!instrument) {
    return {
      code: 'INSTRUMENT_NOT_FOUND',
      message: `Instrument ${instrumentId} not found`,
    };
  }
  const isCurrency = instrument.type === 'MONEDA';
  if (isCashSide(side) !== isCurrency) {
    return {
      code: 'SIDE_INSTRUMENT_MISMATCH',
      message: isCurrency
        ? `Instrument ${instrumentId} is the cash instrument and only accepts CASH_IN and CASH_OUT`
        : `Side ${side} is only valid on the cash instrument`,
    };
  }
  if (!isCurrency && lastClose === null) {
    return {
      code: 'NO_MARKET_DATA',
      message: `Instrument ${instrumentId} has no market data`,
    };
  }
  return null;
}

/**
 * Cash orders are priced at 1, MARKET at the last close, LIMIT at the price
 * the client sent. `checkOrderRules` and the DTO guarantee the inputs exist.
 */
export function resolvePrice(input: {
  type: OrderType;
  side: OrderSide;
  requestedPrice: D | null;
  lastClose: D | null;
}): D {
  const { type, side, requestedPrice, lastClose } = input;
  if (isCashSide(side)) return new D(1);
  const price = type === 'MARKET' ? lastClose : requestedPrice;
  if (price === null) {
    throw new Error(`A ${type} order needs a price to be resolved`);
  }
  return price;
}

export type SizeResult = { size: number } | { violation: OrderRuleViolation };

/**
 * An exact `size` is used as is. An `amount` becomes the most whole shares it
 * buys, floor(amount / price); fractions of shares do not exist.
 */
export function resolveSize(
  input: { size?: number; amount?: D },
  price: D,
): SizeResult {
  if (input.size !== undefined) return { size: input.size };
  if (input.amount === undefined) {
    throw new Error('Either size or amount is required');
  }
  const shares = input.amount.div(price).floor();
  if (shares.isZero()) {
    return {
      violation: {
        code: 'ZERO_SHARES',
        message: 'The amount is not enough for a single share',
      },
    };
  }
  if (shares.gt(INT_MAX)) {
    return {
      violation: {
        code: 'SIZE_OUT_OF_RANGE',
        message: `The amount results in more than ${INT_MAX} shares`,
      },
    };
  }
  return { size: shares.toNumber() };
}

export interface OrderDecision {
  status: OrderStatus;
  rejectionReason: RejectionReason | null;
}

/**
 * The balance check, run under the user lock with the user's FILLED and NEW
 * orders. BUY and CASH_OUT need available cash, SELL needs
 * available shares, CASH_IN always passes. An order that passes is FILLED if
 * MARKET and NEW if LIMIT; one that does not is REJECTED with its reason.
 */
export function decideOrder(
  order: {
    side: OrderSide;
    type: OrderType;
    instrumentId: number;
    size: number;
    price: D;
  },
  ledger: readonly LedgerOrder[],
): OrderDecision {
  const rejected = (reason: RejectionReason): OrderDecision => ({
    status: 'REJECTED',
    rejectionReason: reason,
  });

  switch (order.side) {
    case 'BUY':
    case 'CASH_OUT':
      if (order.price.mul(order.size).gt(availableCash(ledger))) {
        return rejected('INSUFFICIENT_FUNDS');
      }
      break;
    case 'SELL':
      if (order.size > availableShares(ledger, order.instrumentId)) {
        return rejected('INSUFFICIENT_SHARES');
      }
      break;
    case 'CASH_IN':
      break;
  }
  return {
    status: order.type === 'MARKET' ? 'FILLED' : 'NEW',
    rejectionReason: null,
  };
}
