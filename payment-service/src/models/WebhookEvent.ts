import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'stripe_event_id', type: 'varchar', length: 255, unique: true })
  @Index()
  stripeEventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  @Index()
  eventType!: string;

  @Column({ name: 'event_data', type: 'simple-json' })
  eventData!: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  @Index()
  processed!: boolean;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt?: Date;
}
