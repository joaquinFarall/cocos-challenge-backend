import { AppValidationPipe } from '../../common/validation/validation.pipe';
import { ApiException } from '../../common/errors/api.exception';
import { CreateOrderDto } from './create-order.dto';

const pipe = new AppValidationPipe();
const run = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CreateOrderDto });

async function details(body: unknown) {
  try {
    await run(body);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiException);
    const exception = error as ApiException;
    expect(exception.getStatus()).toBe(400);
    return exception.details ?? [];
  }
  throw new Error('Expected a 400');
}

const market = { instrument_id: 47, side: 'BUY', type: 'MARKET', size: 10 };
const limit = { ...market, type: 'LIMIT', price: '930.50' };

describe('CreateOrderDto', () => {
  it.each([
    ['MARKET with size', market],
    ['MARKET with amount', { ...market, size: undefined, amount: '10000' }],
    ['LIMIT with price and size', limit],
    [
      'LIMIT with price and amount',
      { ...limit, size: undefined, amount: '10000.50' },
    ],
    [
      'cash order',
      { instrument_id: 66, side: 'CASH_IN', type: 'MARKET', size: 500 },
    ],
    ['max price', { ...limit, price: '99999999.99' }],
    ['max int size', { ...market, size: 2147483647 }],
    ['price below 1', { ...limit, price: '0.01' }],
  ])('accepts %s', async (_name, body) => {
    await expect(run(body)).resolves.toBeInstanceOf(CreateOrderDto);
  });

  it.each<[string, unknown, string, string]>([
    [
      'instrument_id as string',
      { ...market, instrument_id: '47' },
      'instrument_id',
      'integer',
    ],
    [
      'instrument_id 0',
      { ...market, instrument_id: 0 },
      'instrument_id',
      'not be less',
    ],
    [
      'instrument_id above INT',
      { ...market, instrument_id: 2147483648 },
      'instrument_id',
      'not be greater',
    ],
    [
      'instrument_id missing',
      { side: 'BUY', type: 'MARKET', size: 1 },
      'instrument_id',
      'integer',
    ],
    ['lowercase side', { ...market, side: 'buy' }, 'side', 'one of'],
    ['unknown side', { ...market, side: 'HOLD' }, 'side', 'one of'],
    ['lowercase type', { ...market, type: 'market' }, 'type', 'one of'],
    ['size 0', { ...market, size: 0 }, 'size', 'not be less'],
    ['negative size', { ...market, size: -1 }, 'size', 'not be less'],
    ['fractional size', { ...market, size: 1.5 }, 'size', 'integer'],
    ['string size', { ...market, size: '10' }, 'size', 'integer'],
    ['null size', { ...market, size: null }, 'size', 'integer'],
    [
      'size above INT',
      { ...market, size: 2147483648 },
      'size',
      'not be greater',
    ],
    [
      'LIMIT without price',
      { ...market, type: 'LIMIT' },
      'price',
      'required for LIMIT',
    ],
    [
      'MARKET with price',
      { ...market, price: '930' },
      'price',
      'must not be sent for MARKET',
    ],
    ['numeric price', { ...limit, price: 930.5 }, 'price', 'decimal string'],
    ['price 0', { ...limit, price: '0' }, 'price', 'positive'],
    ['price 0.00', { ...limit, price: '0.00' }, 'price', 'positive'],
    ['negative price', { ...limit, price: '-1' }, 'price', 'decimal string'],
    ['3 decimals', { ...limit, price: '1.001' }, 'price', 'at most 2 decimals'],
    ['exponent', { ...limit, price: '1e3' }, 'price', 'decimal string'],
    ['leading zero', { ...limit, price: '01.50' }, 'price', 'decimal string'],
    [
      'price above NUMERIC(10,2)',
      { ...limit, price: '100000000' },
      'price',
      'decimal string',
    ],
    [
      'amount 0',
      { ...market, size: undefined, amount: '0' },
      'amount',
      'positive',
    ],
    [
      'amount with 3 decimals',
      { ...market, size: undefined, amount: '10.123' },
      'amount',
      'decimal string',
    ],
    [
      'size and amount together',
      { ...market, amount: '100' },
      'amount',
      'cannot be sent together',
    ],
    [
      'neither size nor amount',
      { instrument_id: 47, side: 'BUY', type: 'MARKET' },
      'amount',
      'either size or amount',
    ],
    [
      'cash LIMIT',
      {
        instrument_id: 66,
        side: 'CASH_IN',
        type: 'LIMIT',
        price: '1',
        size: 5,
      },
      'type',
      'must be MARKET',
    ],
    ['unknown property', { ...market, sise: 3 }, 'sise', 'should not exist'],
  ])('rejects %s', async (_name, body, field, text) => {
    const found = await details(body);
    expect(found).toContainEqual({
      field,
      message: expect.stringContaining(text),
    });
  });

  it.each([[[]], [null], ['text'], [42]])(
    'rejects a body that is not a JSON object: %j',
    async (body) => {
      await expect(run(body)).rejects.toMatchObject({
        status: 400,
        response: 'Request body must be a JSON object',
      });
    },
  );

  it('reports every invalid field at once', async () => {
    const found = await details({
      instrument_id: 'x',
      side: 'nope',
      type: 'MARKET',
    });
    expect(found.map((d) => d.field)).toEqual(
      expect.arrayContaining(['instrument_id', 'side', 'amount']),
    );
  });
});
