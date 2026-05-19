import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_address', type: 'varchar', length: 42, unique: true })
  @Index()
  walletAddress!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255, unique: true, nullable: true })
  @Index()
  stripeCustomerId?: string;

  @Column({ name: 'preferred_payment_method', type: 'varchar', length: 20, nullable: true })
  preferredPaymentMethod?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
