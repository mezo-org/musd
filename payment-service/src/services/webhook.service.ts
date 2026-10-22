import Stripe from 'stripe';
import { stripe } from '../config/stripe.config';
import { AppDataSource } from '../config/database';
import { WebhookEvent } from '../models/WebhookEvent';
import { onrampService } from './onramp.service';
import { logger } from '../utils/logger';
import { config } from '../config';

export class WebhookService {
  private webhookEventRepository = AppDataSource.getRepository(WebhookEvent);

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event {
    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret
      );
    } catch (error) {
      logger.error('Webhook signature verification failed', { error });
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Process webhook event
   */
  async processWebhook(event: Stripe.Event): Promise<void> {
    // Check if event already processed (idempotency)
    const existingEvent = await this.webhookEventRepository.findOne({
      where: { stripeEventId: event.id },
    });

    if (existingEvent?.processed) {
      logger.info('Webhook event already processed', { eventId: event.id });
      return;
    }

    // Save webhook event
    const webhookEvent = this.webhookEventRepository.create({
      stripeEventId: event.id,
      eventType: event.type,
      eventData: event.data as any,
      processed: false,
    });

    await this.webhookEventRepository.save(webhookEvent);

    try {
      // Process based on event type
      switch (event.type) {
        case 'crypto.onramp_session.completed' as any:
          await this.handleOnrampCompleted(event);
          break;

        case 'crypto.onramp_session.updated' as any:
          await this.handleOnrampUpdated(event);
          break;

        case 'payment_intent.succeeded':
          // Will be implemented in task 3.2
          logger.info('Payment intent succeeded', { eventId: event.id });
          break;

        case 'payment_intent.payment_failed':
          // Will be implemented in task 3.2
          logger.info('Payment intent failed', { eventId: event.id });
          break;

        case 'payout.paid':
          // Will be implemented in task 4.1
          logger.info('Payout paid', { eventId: event.id });
          break;

        case 'payout.failed':
          // Will be implemented in task 4.1
          logger.info('Payout failed', { eventId: event.id });
          break;

        default:
          logger.info('Unhandled webhook event type', {
            eventType: event.type,
            eventId: event.id,
          });
      }

      // Mark as processed
      webhookEvent.processed = true;
      webhookEvent.processedAt = new Date();
      await this.webhookEventRepository.save(webhookEvent);

      logger.info('Webhook event processed successfully', {
        eventId: event.id,
        eventType: event.type,
      });
    } catch (error) {
      logger.error('Error processing webhook event', {
        eventId: event.id,
        eventType: event.type,
        error,
      });

      webhookEvent.processingError = error instanceof Error ? error.message : 'Unknown error';
      await this.webhookEventRepository.save(webhookEvent);

      throw error;
    }
  }

  /**
   * Handle onramp session completed event
   */
  private async handleOnrampCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as any;

    logger.info('Onramp session completed', {
      sessionId: session.id,
      walletAddress: session.wallet_address,
    });

    await onrampService.updateSessionFromWebhook(
      session.id,
      'completed',
      session.transaction_details
    );

    // Emit application event for completed onramp
    // This can be used to trigger notifications, analytics, etc.
    this.emitOnrampCompletedEvent(session);
  }

  /**
   * Handle onramp session updated event
   */
  private async handleOnrampUpdated(event: Stripe.Event): Promise<void> {
    const session = event.data.object as any;

    logger.info('Onramp session updated', {
      sessionId: session.id,
      status: session.status,
    });

    await onrampService.updateSessionFromWebhook(
      session.id,
      session.status,
      session.transaction_details
    );
  }

  /**
   * Emit onramp completed event for application listeners
   */
  private emitOnrampCompletedEvent(session: any): void {
    // This is a placeholder for event emission
    // In a real application, you might use EventEmitter, Redis pub/sub, or message queue
    logger.info('Emitting onramp completed event', {
      sessionId: session.id,
      walletAddress: session.wallet_address,
      amount: session.transaction_details?.destination_amount,
    });

    // Example: Trigger notifications, update analytics, etc.
    // eventEmitter.emit('onramp.completed', { session });
  }

  /**
   * Get webhook event by ID
   */
  async getWebhookEvent(eventId: string): Promise<WebhookEvent | null> {
    return this.webhookEventRepository.findOne({
      where: { stripeEventId: eventId },
    });
  }

  /**
   * Get unprocessed webhook events
   */
  async getUnprocessedEvents(limit: number = 100): Promise<WebhookEvent[]> {
    return this.webhookEventRepository.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * Retry failed webhook event
   */
  async retryWebhookEvent(eventId: string): Promise<void> {
    const webhookEvent = await this.webhookEventRepository.findOne({
      where: { stripeEventId: eventId },
    });

    if (!webhookEvent) {
      throw new Error('Webhook event not found');
    }

    if (webhookEvent.processed) {
      throw new Error('Webhook event already processed');
    }

    // Reconstruct Stripe event
    const stripeEvent: Stripe.Event = {
      id: webhookEvent.stripeEventId,
      type: webhookEvent.eventType,
      data: webhookEvent.eventData as any,
    } as Stripe.Event;

    // Process the event
    await this.processWebhook(stripeEvent);
  }
}

export const webhookService = new WebhookService();
