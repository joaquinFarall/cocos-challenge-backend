import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../common/errors/api.exception';
import { Order } from '../database/entities/order.entity';
import { findRelevantOrders } from '../database/relevant-orders.query';
import { D } from '../domain/decimal';
import type { InstrumentInfo } from '../domain/orders';

export interface InstrumentWithClose {
  instrument: InstrumentInfo;
  lastClose: D | null;
}

export type NewOrder = Omit<Order, 'id' | 'instrument' | 'user'>;

interface InstrumentRow {
  id: number;
  type: InstrumentInfo['type'];
  close: string | null;
}

@Injectable()
export class OrdersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async userExists(id: number): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      'SELECT 1 FROM users WHERE id = $1',
      [id],
    );
    return rows.length > 0;
  }

  async findInstrument(id: number): Promise<InstrumentWithClose | null> {
    const rows: InstrumentRow[] = await this.dataSource.query(
      `SELECT i.id, i.type,
              (SELECT m.close FROM marketdata m
                WHERE m.instrumentid = i.id
                ORDER BY m.date DESC LIMIT 1) AS close
         FROM instruments i
        WHERE i.id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const [row] = rows;
    return {
      instrument: { id: row.id, type: row.type },
      lastClose: row.close === null ? null : new D(row.close),
    };
  }

  /**
   * Lock the user row, read the user's FILLED and NEW orders, let
   * `build` decide, insert. Orders of the same user queue on the lock; each
   * one reloads the ledger after the previous one committed.
   */
  placeUnderLock(
    userId: number,
    build: (ledger: readonly Order[]) => NewOrder,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const locked: unknown[] = await manager.query(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (locked.length === 0) {
        throw new ApiException(
          404,
          'USER_NOT_FOUND',
          `User ${userId} not found`,
        );
      }
      const ledger = await findRelevantOrders(manager, userId);
      return manager.save(Order, build(ledger));
    });
  }
}
