export const INSTRUMENT_TYPES = ['ACCIONES', 'MONEDA'] as const;
export const ORDER_SIDES = ['BUY', 'SELL', 'CASH_IN', 'CASH_OUT'] as const;
export const ORDER_TYPES = ['MARKET', 'LIMIT'] as const;
export const ORDER_STATUSES = [
  'NEW',
  'FILLED',
  'REJECTED',
  'CANCELLED',
] as const;
export const REJECTION_REASONS = [
  'INSUFFICIENT_FUNDS',
  'INSUFFICIENT_SHARES',
  'DATA_CORRECTION',
] as const;

export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];
export type OrderSide = (typeof ORDER_SIDES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type RejectionReason = (typeof REJECTION_REASONS)[number];
