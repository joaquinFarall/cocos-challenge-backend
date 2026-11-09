import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-16: the seed order "BMA SELL 30 x 1530 MARKET FILLED" (user 1) sells
 * more than was ever held. Matched by content, not only by id.
 */
const WHERE = `instrumentid = (SELECT id FROM instruments WHERE ticker = 'BMA')
  AND userid = 1 AND side = 'SELL' AND size = 30 AND price = 1530 AND type = 'MARKET'`;

export class CorrectOversoldBmaOrder1762700000001 implements MigrationInterface {
  name = 'CorrectOversoldBmaOrder1762700000001';

  async up(q: QueryRunner): Promise<void> {
    const affected = await this.update(
      q,
      `status = 'REJECTED', rejection_reason = 'DATA_CORRECTION'`,
      `AND status = 'FILLED'`,
    );
    // 0 rows: database without that seed row (nothing to correct).
    if (affected > 1) {
      throw new Error(
        `Expected at most 1 BMA order to correct, got ${affected}`,
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await this.update(
      q,
      `status = 'FILLED', rejection_reason = NULL`,
      `AND status = 'REJECTED' AND rejection_reason = 'DATA_CORRECTION'`,
    );
  }

  private async update(
    q: QueryRunner,
    set: string,
    extra: string,
  ): Promise<number> {
    const result: unknown = await q.query(
      `UPDATE orders SET ${set} WHERE ${WHERE} ${extra}`,
    );
    // pg driver returns [rows, affectedCount] for UPDATE
    return Array.isArray(result) ? Number(result[1]) : 0;
  }
}
