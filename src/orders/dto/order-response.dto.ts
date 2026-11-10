import { ApiProperty } from '@nestjs/swagger';
import {
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  REJECTION_REASONS,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type RejectionReason,
} from '../../domain/enums';

export class OrderResponseDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 47 })
  instrument_id: number;

  @ApiProperty({ example: 1 })
  user_id: number;

  @ApiProperty({ enum: ORDER_SIDES, example: 'BUY' })
  side: OrderSide;

  @ApiProperty({ description: 'Shares (integer)', example: 10 })
  size: number;

  @ApiProperty({
    description:
      'Price per share: the last close for MARKET, the requested one for LIMIT, 1 for cash. Decimal string with 2 decimals',
    example: '925.85',
  })
  price: string;

  @ApiProperty({ enum: ORDER_TYPES, example: 'MARKET' })
  type: OrderType;

  @ApiProperty({
    enum: ORDER_STATUSES,
    description:
      'FILLED for MARKET, NEW for LIMIT, REJECTED when cash or shares are not enough (still HTTP 201)',
    example: 'FILLED',
  })
  status: OrderStatus;

  @ApiProperty({
    enum: REJECTION_REASONS,
    nullable: true,
    description: 'Only set when the status is REJECTED',
    example: null,
  })
  rejection_reason: RejectionReason | null;

  @ApiProperty({ example: '2023-07-14T15:30:00.000Z' })
  datetime: string;
}
