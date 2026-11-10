import { In, type EntityManager } from 'typeorm';
import { Order } from './entities/order.entity';

/**
 * FILLED and NEW orders of a user: the only ones that affect cash or positions
 * Takes a manager so it can also run inside a transaction.
 */
export function findRelevantOrders(
  manager: EntityManager,
  userId: number,
): Promise<Order[]> {
  return manager.find(Order, {
    where: { userId, status: In(['FILLED', 'NEW']) },
    order: { datetime: 'ASC', id: 'ASC' },
  });
}
