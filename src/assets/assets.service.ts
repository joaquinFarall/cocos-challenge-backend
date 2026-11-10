import { Injectable } from '@nestjs/common';
import { containsPattern } from '../database/like-pattern';
import { D, toMoneyString } from '../domain/decimal';
import { dailyReturnPct } from '../domain/market';
import { AssetDto, AssetsPageDto } from './dto/assets-page.dto';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto';
import {
  AssetsRepository,
  type AssetFilters,
  type AssetRow,
} from './assets.repository';

const toPattern = (value: string | undefined) =>
  value ? containsPattern(value) : undefined;

function toAssetDto(row: AssetRow): AssetDto {
  const hasQuote = row.close !== null && row.previous_close !== null;
  const dailyReturn = hasQuote
    ? dailyReturnPct(new D(row.close!), new D(row.previous_close!))
    : null;
  return {
    id: row.id,
    ticker: row.ticker ?? '',
    name: row.name ?? '',
    type: row.type ?? '',
    last_close: row.close === null ? null : toMoneyString(new D(row.close)),
    daily_return: dailyReturn === null ? null : toMoneyString(dailyReturn),
    price_date: row.price_date,
  };
}

@Injectable()
export class AssetsService {
  constructor(private readonly repository: AssetsRepository) {}

  async list(query: ListAssetsQueryDto): Promise<AssetsPageDto> {
    const { page, limit } = query;
    const filters: AssetFilters = {
      namePattern: toPattern(query.name),
      tickerPattern: toPattern(query.ticker),
    };
    const [total, rows] = await Promise.all([
      this.repository.count(filters),
      this.repository.findPage(filters, limit, (page - 1) * limit),
    ]);
    return {
      data: rows.map(toAssetDto),
      total,
      page,
      limit,
    };
  }
}
