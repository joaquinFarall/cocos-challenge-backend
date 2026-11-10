import { AppValidationPipe } from './validation.pipe';

describe('AppValidationPipe', () => {
  const pipe = new AppValidationPipe();

  it.each(['01', '1.0', '1e3', 'abc'])(
    'leaves the named path param %j as the string it received',
    async (value) => {
      await expect(
        pipe.transform(value, { type: 'param', data: 'id', metatype: Number }),
      ).resolves.toBe(value);
    },
  );
});
