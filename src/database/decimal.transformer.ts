import type { ValueTransformer } from 'typeorm';
import { D } from '../domain/decimal';

/** Maps Postgres NUMERIC (string) to Decimal and back; never a JS number. */
export const DecimalTransformer: ValueTransformer = {
  from: (value: string | null | undefined): D | null =>
    value === null || value === undefined ? null : new D(value),
  to: (value: D | string | null | undefined): string | null =>
    value === null || value === undefined ? null : new D(value).toFixed(),
};
