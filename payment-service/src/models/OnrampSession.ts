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

@Entity('onramp_sessions')
export class OnrampSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'stripe_session_id', type: 'varchar', length: 255, unique: true })
  @Index()
  stripeSessionId!: string;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  status!: 'initialized' | 'pending' | 'completed' | 'failed';

  // Source (fiat) details
  @Column({ name: 'source_amount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  sourceAmount?: number;

  @Column({ name: 'source_currency', type: 'varchar', length: 3, nullable: true })
  sourceCurrency?: string;

  // Destination (MUSD) details
  @Column({ name: 'destination_amount', type: 'decimal', precision: 18, scale: 6, nullable: true })
  destinationAmount?: number;

  @Column({ name: 'destination_currency', type: 'varchar', length: 10, default: 'musd' })
  destinationCurrency!: string;

  @Column({ name: 'destination_network', type: 'varchar', length: 20, default: 'mezo' })
  destinationNetwork!: string;

  @Column({ name: 'wallet_address', type: 'varchar', length: 42 })
  @Index()
  walletAddress!: string;

  // Transaction details
  @Column({ name: 'tx_hash', type: 'varchar', length: 66, nullable: true })
  txHash?: string;

  @Column({ name: 'block_number', type: 'bigint', nullable: true })
  blockNumber?: number;

  // Fees
  @Column({ name: 'network_fee', type: 'decimal', precision: 18, scale: 6, nullable: true })
  networkFee?: number;

  @Column({ name: 'transaction_fee', type: 'decimal', precision: 18, scale: 2, nullable: true })
  transactionFee?: number;

  // Metadata
  @Column({ name: 'client_secret', type: 'varchar', length: 255, nullable: true })
  clientSecret?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt?: Date;
}
