import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { D } from '../domain/decimal';
import { Order } from '../database/entities/order.entity';
import { findRelevantOrders } from '../database/relevant-orders.query';
import { User } from '../database/entities/user.entity';

export interface InstrumentQuote {
  instrumentId: number;
  ticker: string;
  name: string;
  close: D;
}

interface QuoteRow {
  instrumentid: number;
  ticker: string | null;
  name: string | null;
  close: string;
}

@Injectable()
export class PortfolioRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  findUser(id: number): Promise<User | null> {
    return this.users.findOne({
      where: { id },
      select: { id: true, accountNumber: true },
    });
  }

  findRelevantOrders(userId: number): Promise<Order[]> {
    return findRelevantOrders(this.orders.manager, userId);
  }

  /** Latest close and instrument info for all ids in a single query. */
  async findLatestQuotes(
    instrumentIds: readonly number[],
  ): Promise<Map<number, InstrumentQuote>> {
    if (instrumentIds.length === 0) return new Map();
    const rows: QuoteRow[] = await this.orders.manager.query(
      `SELECT DISTINCT ON (m.instrumentid)
         m.instrumentid, m.close, i.ticker, i.name
       FROM marketdata m
       JOIN instruments i ON i.id = m.instrumentid
       WHERE m.instrumentid = ANY($1)
       ORDER BY m.instrumentid, m.date DESC`,
      [instrumentIds],
    );
    return new Map(
      rows.map((row) => [
        row.instrumentid,
        {
          instrumentId: row.instrumentid,
          ticker: row.ticker ?? '',
          name: row.name ?? '',
          close: new D(row.close),
        },
      ]),
    );
  }
}
