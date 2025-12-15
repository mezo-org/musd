import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';

@Entity('payment_intents')
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'stripe_payment_intent_id', type: 'varchar', length: 255, unique: true })
  @Index()
  stripePaymentIntentId!: string;

  @Column({ type: 'varchar', length: 30 })
  @Index()
  status!: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'canceled';

  // Fiat settlement details
  @Column({ type: 'bigint' }) // Amount in cents
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  // MUSD payment details
  @Column({ name: 'musd_amount', type: 'decimal', precision: 18, scale: 6, nullable: true })
  musdAmount?: number;

  @Column({ name: 'musd_network', type: 'varchar', length: 20, default: 'mezo' })
  musdNetwork!: string;

  @Column({ name: 'settlement_address', type: 'varchar', length: 42, nullable: true })
  settlementAddress?: string;

  // Transaction details
  @Column({ name: 'tx_hash', type: 'varchar', length: 66, nullable: true })
  txHash?: string;

  @Column({ name: 'block_number', type: 'bigint', nullable: true })
  blockNumber?: number;

  // Metadata
  @Column({ name: 'client_secret', type: 'varchar', length: 255, nullable: true })
  clientSecret?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'succeeded_at', type: 'datetime', nullable: true })
  succeededAt?: Date;
}
