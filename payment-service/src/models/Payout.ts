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

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'stripe_payout_id', type: 'varchar', length: 255, unique: true })
  @Index()
  stripePayoutId!: string;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  status!: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';

  // Source (fiat) details
  @Column({ type: 'bigint' }) // Amount in cents
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  // Destination (MUSD) details
  @Column({ name: 'musd_amount', type: 'decimal', precision: 18, scale: 6, nullable: true })
  musdAmount?: number;

  @Column({ name: 'destination_address', type: 'varchar', length: 42 })
  @Index()
  destinationAddress!: string;

  @Column({ name: 'destination_network', type: 'varchar', length: 20, default: 'mezo' })
  destinationNetwork!: string;

  // Transaction details
  @Column({ name: 'tx_hash', type: 'varchar', length: 66, nullable: true })
  txHash?: string;

  @Column({ name: 'block_number', type: 'bigint', nullable: true })
  blockNumber?: number;

  // Connected account (for marketplace payouts)
  @Column({ name: 'connected_account_id', type: 'varchar', length: 255, nullable: true })
  connectedAccountId?: string;

  // Metadata
  @Column({ name: 'estimated_arrival', type: 'datetime', nullable: true })
  estimatedArrival?: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt?: Date;
}
