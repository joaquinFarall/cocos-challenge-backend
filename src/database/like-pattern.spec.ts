import { containsPattern, escapeLike } from './like-pattern';

describe('like-pattern', () => {
  it.each([
    ['pamp', 'pamp'],
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['a\\b', 'a\\\\b'],
    ['%_\\', '\\%\\_\\\\'],
    ['', ''],
  ])('escapes %j as %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });

  it('wraps the escaped value for a partial match', () => {
    expect(containsPattern('50%_')).toBe('%50\\%\\_%');
  });
});
