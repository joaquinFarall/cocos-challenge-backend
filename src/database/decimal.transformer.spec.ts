import Decimal from 'decimal.js';
import { DecimalTransformer } from './decimal.transformer';

describe('DecimalTransformer', () => {
  it('reads a NUMERIC string as Decimal', () => {
    const result = DecimalTransformer.from('930.50') as Decimal;
    expect(result).toBeInstanceOf(Decimal);
    expect(result.toFixed(2)).toBe('930.50');
  });

  it('writes a Decimal as a string', () => {
    expect(DecimalTransformer.to(new Decimal('0.10'))).toBe('0.1');
  });

  it('passes null through in both directions', () => {
    expect(DecimalTransformer.from(null)).toBeNull();
    expect(DecimalTransformer.to(null)).toBeNull();
  });
});
