import { ApiProperty } from '@nestjs/swagger';

export class AssetDto {
  @ApiProperty({ example: 47 })
  id: number;

  @ApiProperty({ example: 'PAMP' })
  ticker: string;

  @ApiProperty({ example: 'Pampa Holding S.A.' })
  name: string;

  @ApiProperty({ example: 'ACCIONES' })
  type: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Latest close, decimal string with 2 decimals; null when the instrument has no market data',
    example: '925.85',
  })
  last_close: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Daily return in percent, (close - previous_close) / previous_close x 100, decimal string with 2 decimals; null when there is no market data',
    example: '0.44',
  })
  daily_return: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Date (YYYY-MM-DD) of the market data row used for last_close; null when there is none',
    example: '2023-07-14',
  })
  price_date: string | null;
}

export class AssetsPageDto {
  @ApiProperty({ type: [AssetDto], description: 'Sorted by ticker' })
  data: AssetDto[];

  @ApiProperty({ description: 'Total matches across all pages', example: 65 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
