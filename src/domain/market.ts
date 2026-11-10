import { D } from './decimal';

/**
 * Daily return in percent: (close − previousClose) / previousClose.
 */
export function dailyReturnPct(close: D, previousClose: D): D | null {
  if (previousClose.isZero()) return null;
  return close.minus(previousClose).div(previousClose).mul(100);
}
