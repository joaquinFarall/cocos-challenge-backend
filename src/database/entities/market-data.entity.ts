import type Decimal from 'decimal.js';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DecimalTransformer } from '../decimal.transformer';
import { Instrument } from './instrument.entity';

const numeric = {
  type: 'numeric',
  precision: 10,
  scale: 2,
  transformer: DecimalTransformer,
} as const;

@Entity({ name: 'marketdata' })
@Unique('marketdata_instrumentid_date_key', ['instrumentId', 'date'])
export class MarketData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instrumentid', type: 'int' })
  instrumentId: number;

  @ManyToOne(() => Instrument, { nullable: false })
  @JoinColumn({ name: 'instrumentid' })
  instrument?: Instrument;

  @Column({ ...numeric, nullable: true })
  high: Decimal | null;

  @Column({ ...numeric, nullable: true })
  low: Decimal | null;

  @Column({ ...numeric, nullable: true })
  open: Decimal | null;

  @Column(numeric)
  close: Decimal;

  @Column({ ...numeric, name: 'previousclose' })
  previousClose: Decimal;

  @Column({ type: 'date' })
  date: string;
}
