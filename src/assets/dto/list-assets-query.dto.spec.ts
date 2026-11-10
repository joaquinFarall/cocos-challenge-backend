import { ApiException } from '../../common/errors/api.exception';
import { AppValidationPipe } from '../../common/validation/validation.pipe';
import { ListAssetsQueryDto } from './list-assets-query.dto';

const pipe = new AppValidationPipe();
const run = (query: unknown) =>
  pipe.transform(query, { type: 'query', metatype: ListAssetsQueryDto });

async function fields(query: unknown): Promise<string[]> {
  try {
    await run(query);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiException);
    const exception = error as ApiException;
    expect(exception.getStatus()).toBe(400);
    return [...new Set((exception.details ?? []).map((d) => d.field))];
  }
  throw new Error('Expected a 400');
}

describe('ListAssetsQueryDto', () => {
  it('applies defaults', async () => {
    expect(await run({})).toMatchObject({ page: 1, limit: 20 });
  });

  it('converts strict integer strings', async () => {
    expect(await run({ page: '2', limit: '100' })).toMatchObject({
      page: 2,
      limit: 100,
    });
    expect(await run({ page: '2147483647' })).toMatchObject({
      page: 2147483647,
    });
  });

  it('trims name and ticker, keeping blanks as empty strings', async () => {
    expect(await run({ name: '  banco ', ticker: '   ' })).toMatchObject({
      name: 'banco',
      ticker: '',
    });
  });

  it('accepts a 255 character name', async () => {
    await expect(run({ name: 'a'.repeat(255) })).resolves.toBeDefined();
  });

  it.each(['0', '-1', '01', '1.0', '1e2', 'abc', '', ' 2', '2147483648'])(
    'rejects page=%j',
    async (page) => {
      expect(await fields({ page })).toEqual(['page']);
    },
  );

  it.each(['0', '101', '01', '1.5', 'abc', ''])(
    'rejects limit=%j',
    async (limit) => {
      expect(await fields({ limit })).toEqual(['limit']);
    },
  );

  it('rejects unknown params', async () => {
    expect(await fields({ foo: 'bar' })).toEqual(['foo']);
  });

  it('rejects a repeated param', async () => {
    expect(await fields({ name: ['a', 'b'] })).toEqual(['name']);
  });

  it('rejects names and tickers over 255 characters after trimming', async () => {
    expect(await fields({ name: 'a'.repeat(256) })).toEqual(['name']);
    expect(await fields({ ticker: 'a'.repeat(256) })).toEqual(['ticker']);
  });
});
