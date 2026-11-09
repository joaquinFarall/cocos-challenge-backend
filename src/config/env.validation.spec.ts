import { validateEnv } from './env.validation';

const url = 'postgresql://cocos:cocos@localhost:5433/cocos';

describe('validateEnv', () => {
  it('accepts a valid config and applies defaults', () => {
    const env = validateEnv({ DATABASE_URL: url });
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ DATABASE_URL: url, PORT: '3000' }).PORT).toBe(3000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres protocol', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://a:b@h/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ DATABASE_URL: url, PORT: 'abc' })).toThrow(
      /PORT/,
    );
  });
});
