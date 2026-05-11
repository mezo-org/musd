import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'source_amount', type: 'decimal', precision: 18, scale: 2 })
  sourceAmount!: number;

  @Column({ name: 'source_currency', type: 'varchar', length: 3 })
  sourceCurrency!: string;

  @Column({ name: 'destination_amount', type: 'decimal', precision: 18, scale: 6 })
  destinationAmount!: number;

  @Column({ name: 'destination_currency', type: 'varchar', length: 10 })
  destinationCurrency!: string;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 18, scale: 8 })
  exchangeRate!: number;

  @Column({ type: 'simple-json', nullable: true })
  fees?: Record<string, any>;

  @Column({ name: 'valid_until', type: 'datetime', nullable: true })
  validUntil?: Date;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  createdAt!: Date;
}

// Create composite index for currency pairs
@Index(['sourceCurrency', 'destinationCurrency'])
export class QuoteIndex {}
