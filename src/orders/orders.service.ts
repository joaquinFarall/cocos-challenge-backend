import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import type { Order } from '../database/entities/order.entity';
import { D, toMoneyString } from '../domain/decimal';
import {
  checkOrderRules,
  decideOrder,
  resolvePrice,
  resolveSize,
  type OrderRuleViolation,
} from '../domain/orders';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { OrderResponseDto } from './dto/order-response.dto';
import { OrdersRepository } from './orders.repository';

const unprocessable = (violation: OrderRuleViolation) =>
  new ApiException(422, violation.code, violation.message);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly repository: OrdersRepository) {}

  /** 404 user, 422 business rules, then the balance check under the lock. */
  async placeOrder(
    userId: number,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    if (!(await this.repository.userExists(userId))) {
      throw new ApiException(404, 'USER_NOT_FOUND', `User ${userId} not found`);
    }

    const found = await this.repository.findInstrument(dto.instrument_id);
    const lastClose = found?.lastClose ?? null;
    const violation = checkOrderRules({
      side: dto.side,
      instrumentId: dto.instrument_id,
      instrument: found?.instrument ?? null,
      lastClose,
    });
    if (violation) throw unprocessable(violation);

    const price = resolvePrice({
      type: dto.type,
      side: dto.side,
      requestedPrice: dto.price === undefined ? null : new D(dto.price),
      lastClose,
    });
    const sized = resolveSize(
      {
        size: dto.size,
        amount: dto.amount === undefined ? undefined : new D(dto.amount),
      },
      price,
    );
    if ('violation' in sized) throw unprocessable(sized.violation);

    const order = await this.repository.placeUnderLock(userId, (ledger) => ({
      userId,
      instrumentId: dto.instrument_id,
      side: dto.side,
      type: dto.type,
      size: sized.size,
      price,
      ...decideOrder(
        {
          side: dto.side,
          type: dto.type,
          instrumentId: dto.instrument_id,
          size: sized.size,
          price,
        },
        ledger,
      ),
      datetime: new Date(),
    }));

    this.logger.log({
      event: 'order.placed',
      orderId: order.id,
      userId,
      instrumentId: order.instrumentId,
      side: order.side,
      type: order.type,
      status: order.status,
      rejectionReason: order.rejectionReason,
    });
    return toResponse(order);
  }
}

function toResponse(order: Order): OrderResponseDto {
  return {
    id: order.id,
    instrument_id: order.instrumentId,
    user_id: order.userId,
    side: order.side,
    size: order.size,
    price: toMoneyString(order.price),
    type: order.type,
    status: order.status,
    rejection_reason: order.rejectionReason,
    datetime: order.datetime.toISOString(),
  };
}
