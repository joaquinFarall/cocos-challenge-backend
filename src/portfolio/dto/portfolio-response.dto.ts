import { ApiProperty } from '@nestjs/swagger';

export class PortfolioAssetDto {
  @ApiProperty({ example: 47 })
  instrument_id: number;

  @ApiProperty({ example: 'PAMP' })
  ticker: string;

  @ApiProperty({ example: 'Pampa Holding S.A.' })
  name: string;

  @ApiProperty({ description: 'Shares held (integer)', example: 40 })
  shares: number;

  @ApiProperty({
    description: 'shares x last close, decimal string with 2 decimals',
    example: '37034.00',
  })
  value: string;

  @ApiProperty({
    description:
      'Unrealized yield in percent against the weighted-average cost, decimal string with 2 decimals',
    example: '-0.45',
  })
  yield: string;
}

export class PortfolioResponseDto {
  @ApiProperty({ type: String, nullable: true, example: '10001' })
  account_number: string | null;

  @ApiProperty({
    description: 'total_cash minus cash reserved by NEW BUY orders',
    example: '581600.00',
  })
  available: string;

  @ApiProperty({
    description: 'Net cash from FILLED orders',
    example: '707100.00',
  })
  total_cash: string;

  @ApiProperty({
    description: 'total_cash plus the value of every position',
    example: '888940.00',
  })
  total_value: string;

  @ApiProperty({
    type: [PortfolioAssetDto],
    description: 'Positions with shares > 0, sorted by ticker',
  })
  assets: PortfolioAssetDto[];
}
