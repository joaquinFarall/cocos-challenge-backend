import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface AssetFilters {
  namePattern?: string;
  tickerPattern?: string;
}

export interface AssetRow {
  id: number;
  ticker: string | null;
  name: string | null;
  type: string | null;
  close: string | null;
  previous_close: string | null;
  price_date: string | null;
}

function buildWhere(filters: AssetFilters): { sql: string; params: string[] } {
  const clauses = [`i.type IS DISTINCT FROM 'MONEDA'`];
  const params: string[] = [];
  if (filters.namePattern !== undefined) {
    params.push(filters.namePattern);
    clauses.push(`i.name ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (filters.tickerPattern !== undefined) {
    params.push(filters.tickerPattern);
    clauses.push(`i.ticker ILIKE $${params.length} ESCAPE '\\'`);
  }
  return { sql: clauses.join(' AND '), params };
}

@Injectable()
export class AssetsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async count(filters: AssetFilters): Promise<number> {
    const { sql, params } = buildWhere(filters);
    const rows: { total: number }[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM instruments i WHERE ${sql}`,
      params,
    );
    return rows[0].total;
  }

  findPage(
    filters: AssetFilters,
    limit: number,
    offset: number,
  ): Promise<AssetRow[]> {
    const { sql, params } = buildWhere(filters);
    return this.dataSource.query(
      `SELECT i.id, i.ticker, i.name, i.type,
              m.close, m.previousclose AS previous_close,
              to_char(m.date, 'YYYY-MM-DD') AS price_date
         FROM instruments i
         LEFT JOIN LATERAL (
           SELECT md.close, md.previousclose, md.date
             FROM marketdata md
            WHERE md.instrumentid = i.id
            ORDER BY md.date DESC LIMIT 1
         ) m ON TRUE
        WHERE ${sql}
        ORDER BY i.ticker ASC NULLS LAST, i.id ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
  }
}
