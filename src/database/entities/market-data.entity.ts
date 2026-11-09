import type Decimal from 'decimal.js';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DecimalTransformer } from '../decimal.transformer';
import { Instrument } from './instrument.entity';

const numeric = {
  type: 'numeric',
  precision: 10,
  scale: 2,
  nullable: true,
  transformer: DecimalTransformer,
} as const;

@Entity({ name: 'marketdata' })
export class MarketData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instrumentid', type: 'int', nullable: true })
  instrumentId: number | null;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrumentid' })
  instrument?: Instrument;

  @Column(numeric)
  high: Decimal | null;

  @Column(numeric)
  low: Decimal | null;

  @Column(numeric)
  open: Decimal | null;

  @Column(numeric)
  close: Decimal | null;

  @Column({ ...numeric, name: 'previousclose' })
  previousClose: Decimal | null;

  /** DATE as YYYY-MM-DD string, so there are no timezone shifts. */
  @Column({ type: 'date', nullable: true })
  date: string | null;
}
