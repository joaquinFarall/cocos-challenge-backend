import { D, toMoneyString } from './decimal';
import { dailyReturnPct } from './market';

const ret = (close: string, previous: string) => {
  const value = dailyReturnPct(new D(close), new D(previous));
  return value === null ? null : toMoneyString(value);
};

describe('dailyReturnPct', () => {
  it('is positive when the close is above the previous close', () => {
    expect(ret('925.85', '921.80')).toBe('0.44');
  });

  it('is negative when the close is below the previous close', () => {
    expect(ret('1502.80', '1520.25')).toBe('-1.15');
  });

  it('is zero when the price did not move', () => {
    expect(ret('138.00', '138.00')).toBe('0.00');
  });

  it('rounds half-up at the response boundary', () => {
    expect(ret('8.01', '8.00')).toBe('0.13');
    expect(ret('7.99', '8.00')).toBe('-0.13');
  });

  it('keeps full precision until formatted', () => {
    const value = dailyReturnPct(new D('2'), new D('3'))!;
    expect(value.toFixed(6)).toBe('-33.333333');
  });

  it('is null when the previous close is zero', () => {
    expect(dailyReturnPct(new D('10'), new D('0'))).toBeNull();
  });
});
