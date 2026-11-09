import type { MigrationInterface, QueryRunner } from 'typeorm';

/** ADR-14 and ADR-15: constraints, indexes and orders.rejection_reason. */
export class HardenSchema1762700000000 implements MigrationInterface {
  name = 'HardenSchema1762700000000';

  async up(q: QueryRunner): Promise<void> {
    for (const col of [
      'instrumentid',
      'userid',
      'size',
      'price',
      'type',
      'side',
      'status',
      'datetime',
    ]) {
      await q.query(`ALTER TABLE orders ALTER COLUMN ${col} SET NOT NULL`);
    }
    for (const col of ['instrumentid', 'close', 'previousclose', 'date']) {
      await q.query(`ALTER TABLE marketdata ALTER COLUMN ${col} SET NOT NULL`);
    }

    await q.query(`ALTER TABLE orders
      ADD COLUMN rejection_reason VARCHAR(30) NULL,
      ADD CONSTRAINT orders_side_check CHECK (side IN ('BUY','SELL','CASH_IN','CASH_OUT')),
      ADD CONSTRAINT orders_type_check CHECK (type IN ('MARKET','LIMIT')),
      ADD CONSTRAINT orders_status_check CHECK (status IN ('NEW','FILLED','REJECTED','CANCELLED')),
      ADD CONSTRAINT orders_size_positive_check CHECK (size > 0),
      ADD CONSTRAINT orders_price_positive_check CHECK (price > 0),
      ADD CONSTRAINT orders_rejection_reason_check CHECK (rejection_reason IN ('INSUFFICIENT_FUNDS','INSUFFICIENT_SHARES','DATA_CORRECTION')),
      ADD CONSTRAINT orders_rejection_reason_status_check CHECK (rejection_reason IS NULL OR status = 'REJECTED')`);

    await q.query(
      `CREATE UNIQUE INDEX instruments_ticker_upper_key ON instruments (UPPER(ticker))`,
    );
    await q.query(
      `ALTER TABLE marketdata ADD CONSTRAINT marketdata_instrumentid_date_key UNIQUE (instrumentid, date)`,
    );
    await q.query(
      `CREATE INDEX orders_userid_instrumentid_idx ON orders (userid, instrumentid)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX orders_userid_instrumentid_idx`);
    await q.query(
      `ALTER TABLE marketdata DROP CONSTRAINT marketdata_instrumentid_date_key`,
    );
    await q.query(`DROP INDEX instruments_ticker_upper_key`);
    await q.query(`ALTER TABLE orders
      DROP CONSTRAINT orders_rejection_reason_status_check,
      DROP CONSTRAINT orders_rejection_reason_check,
      DROP CONSTRAINT orders_price_positive_check,
      DROP CONSTRAINT orders_size_positive_check,
      DROP CONSTRAINT orders_status_check,
      DROP CONSTRAINT orders_type_check,
      DROP CONSTRAINT orders_side_check,
      DROP COLUMN rejection_reason`);
    for (const col of ['instrumentid', 'close', 'previousclose', 'date']) {
      await q.query(`ALTER TABLE marketdata ALTER COLUMN ${col} DROP NOT NULL`);
    }
    for (const col of [
      'instrumentid',
      'userid',
      'size',
      'price',
      'type',
      'side',
      'status',
      'datetime',
    ]) {
      await q.query(`ALTER TABLE orders ALTER COLUMN ${col} DROP NOT NULL`);
    }
  }
}
