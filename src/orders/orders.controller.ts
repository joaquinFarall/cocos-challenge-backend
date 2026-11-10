import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('users')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':id/orders')
  @ApiOperation({
    summary: 'Place a BUY, SELL, CASH_IN or CASH_OUT order',
    description:
      'MARKET orders are FILLED at the last close; LIMIT orders are NEW. A valid order without enough cash or shares is persisted as REJECTED and still answers 201. Cash orders are MARKET only, on the ARS instrument, priced at 1. Send either `size` or `amount` (size = floor(amount / price)).',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'User id: positive integer up to 2147483647',
    example: 1,
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed id or body',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Business rule violated, nothing persisted: INSTRUMENT_NOT_FOUND, SIDE_INSTRUMENT_MISMATCH, NO_MARKET_DATA, ZERO_SHARES, SIZE_OUT_OF_RANGE',
    type: ErrorResponseDto,
  })
  create(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orders.placeOrder(id, dto);
  }
}
