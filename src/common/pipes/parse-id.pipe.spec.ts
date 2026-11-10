import { BadRequestException } from '@nestjs/common';
import { ParseIdPipe } from './parse-id.pipe';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();

  it.each([
    ['1', 1],
    ['42', 42],
    ['2147483647', 2147483647],
  ])('accepts %s', (input, expected) => {
    expect(pipe.transform(input)).toBe(expected);
  });

  it.each(['0', '-1', '01', '1.0', 'abc', '2147483648', '', ' 1', '1e3'])(
    'rejects %j with 400',
    (input) => {
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    },
  );
});
