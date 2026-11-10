import Decimal from 'decimal.js';

/**
 * The only Decimal constructor used in the app. decimal.js runs each operation
 * with the precision of the receiver's constructor, so mixing in the default
 * `Decimal` would silently fall back to 20 significant digits.
 */
export const D = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});
export type D = InstanceType<typeof D>;

/** Response-boundary formatting: 2 decimals, half-up (ADR-07). */
export function toMoneyString(value: D): string {
  return value.toFixed(2, D.ROUND_HALF_UP);
}
