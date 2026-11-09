import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { InstrumentType } from '../../domain/enums';

@Entity({ name: 'instruments' })
@Index('instruments_ticker_upper_key', { synchronize: false })
export class Instrument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  ticker: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  type: InstrumentType | null;
}
