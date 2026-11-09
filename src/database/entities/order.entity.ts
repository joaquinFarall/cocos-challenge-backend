import type Decimal from 'decimal.js';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  OrderSide,
  OrderStatus,
  OrderType,
  RejectionReason,
} from '../../domain/enums';
import { DecimalTransformer } from '../decimal.transformer';
import { Instrument } from './instrument.entity';
import { User } from './user.entity';

@Entity({ name: 'orders' })
@Index('orders_userid_instrumentid_idx', ['userId', 'instrumentId'])
@Check('orders_side_check', `side IN ('BUY','SELL','CASH_IN','CASH_OUT')`)
@Check('orders_type_check', `type IN ('MARKET','LIMIT')`)
@Check(
  'orders_status_check',
  `status IN ('NEW','FILLED','REJECTED','CANCELLED')`,
)
@Check('orders_size_positive_check', `size > 0`)
@Check('orders_price_positive_check', `price > 0`)
@Check(
  'orders_rejection_reason_check',
  `rejection_reason IN ('INSUFFICIENT_FUNDS','INSUFFICIENT_SHARES','DATA_CORRECTION')`,
)
@Check(
  'orders_rejection_reason_status_check',
  `rejection_reason IS NULL OR status = 'REJECTED'`,
)
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instrumentid', type: 'int' })
  instrumentId: number;

  @ManyToOne(() => Instrument, { nullable: false })
  @JoinColumn({ name: 'instrumentid' })
  instrument?: Instrument;

  @Column({ name: 'userid', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userid' })
  user?: User;

  @Column({ type: 'int' })
  size: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: DecimalTransformer,
  })
  price: Decimal;

  @Column({ type: 'varchar', length: 10 })
  type: OrderType;

  @Column({ type: 'varchar', length: 10 })
  side: OrderSide;

  @Column({ type: 'varchar', length: 20 })
  status: OrderStatus;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  rejectionReason: RejectionReason | null;

  @Column({ type: 'timestamp' })
  datetime: Date;
}
