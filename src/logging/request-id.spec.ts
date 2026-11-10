import { resolveRequestId } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a valid incoming id', () => {
    expect(resolveRequestId('abc-123_X.y:z')).toBe('abc-123_X.y:z');
  });

  it.each([undefined, '', ['a', 'b'], 'a'.repeat(129), 'bad id', 'a\nb', 'é'])(
    'generates a UUID for %p',
    (value) => {
      expect(resolveRequestId(value)).toMatch(UUID);
    },
  );
});
