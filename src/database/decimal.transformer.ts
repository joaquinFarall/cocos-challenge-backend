import Decimal from 'decimal.js';
import type { ValueTransformer } from 'typeorm';

/** Maps Postgres NUMERIC (string) to Decimal and back; never a JS number. */
export const DecimalTransformer: ValueTransformer = {
  from: (value: string | null | undefined): Decimal | null =>
    value === null || value === undefined ? null : new Decimal(value),
  to: (value: Decimal | string | null | undefined): string | null =>
    value === null || value === undefined ? null : new Decimal(value).toFixed(),
};
