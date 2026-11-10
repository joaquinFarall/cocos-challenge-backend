import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateIf,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { InvalidWhen } from '../../common/validation/invalid-when.decorator';
import { D } from '../../domain/decimal';
import {
  ORDER_SIDES,
  ORDER_TYPES,
  type OrderSide,
  type OrderType,
} from '../../domain/enums';

const INT_MAX = 2147483647;
const MONEY_FORMAT = /^(0|[1-9]\d{0,7})(\.\d{1,2})?$/;

function IsMoneyString(options?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isMoneyString',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          value === undefined ||
          (typeof value === 'string' &&
            MONEY_FORMAT.test(value) &&
            new D(value).gt(0)),
        defaultMessage: (args) =>
          `${args?.property} must be a positive decimal string with at most 2 decimals and at most 99999999.99`,
      },
    });
  };
}

const isCash = (side: unknown) => side === 'CASH_IN' || side === 'CASH_OUT';

export class CreateOrderDto {
  @ApiProperty({ example: 47, description: 'Instrument id (1..2147483647)' })
  @IsInt()
  @Min(1)
  @Max(INT_MAX)
  instrument_id: number;

  @ApiProperty({ enum: ORDER_SIDES, example: 'BUY' })
  @IsIn(ORDER_SIDES)
  side: OrderSide;

  @ApiProperty({ enum: ORDER_TYPES, example: 'MARKET' })
  @IsIn(ORDER_TYPES)
  @InvalidWhen<CreateOrderDto>(
    (o) => isCash(o.side) && o.type === 'LIMIT',
    'cash orders (CASH_IN, CASH_OUT) must be MARKET',
  )
  type: OrderType;

  @ApiPropertyOptional({
    example: 10,
    description: 'Exact number of shares. Send either size or amount.',
  })
  @ValidateIf((o: CreateOrderDto) => o.size !== undefined)
  @IsInt()
  @Min(1)
  @Max(INT_MAX)
  size?: number;

  @ApiPropertyOptional({
    example: '930.50',
    description: 'LIMIT price. Required for LIMIT, not allowed for MARKET.',
  })
  @IsMoneyString()
  @InvalidWhen<CreateOrderDto>(
    (o) => o.type === 'LIMIT' && o.price === undefined,
    'price is required for LIMIT orders',
  )
  @InvalidWhen<CreateOrderDto>(
    (o) => o.type === 'MARKET' && o.price !== undefined,
    'price must not be sent for MARKET orders',
  )
  price?: string;

  @ApiPropertyOptional({
    example: '10000.00',
    description:
      'Total to invest in pesos; the size is floor(amount / price). Send either size or amount.',
  })
  @IsMoneyString()
  @InvalidWhen<CreateOrderDto>(
    (o) => o.size === undefined && o.amount === undefined,
    'either size or amount is required',
  )
  @InvalidWhen<CreateOrderDto>(
    (o) => o.size !== undefined && o.amount !== undefined,
    'size and amount cannot be sent together',
  )
  amount?: string;
}
