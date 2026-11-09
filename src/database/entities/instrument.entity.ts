import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { InstrumentType } from './enums';

@Entity({ name: 'instruments' })
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
