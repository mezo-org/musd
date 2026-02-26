import { Router, Request, Response, NextFunction } from 'express';
import { webhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/webhooks/stripe
 * Handle Stripe webhook events
 * 
 * Note: This endpoint should NOT use the standard JSON body parser
 * We need the raw body for signature verification
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['stripe-signature'];

      if (!signature || typeof signature !== 'string') {
        logger.error('Missing Stripe signature header');
        return res.status(400).json({
          success: false,
          error: 'Missing Stripe signature',
        });
      }

      // Verify webhook signature and construct event
      const event = webhookService.verifyWebhookSignature(
        req.body,
        signature
      );

      logger.info('Received webhook event', {
        eventId: event.id,
        eventType: event.type,
      });

      // Process webhook asynchronously
      // We respond immediately to Stripe and process in background
      webhookService.processWebhook(event).catch((error) => {
        logger.error('Error processing webhook in background', {
          eventId: event.id,
          error,
        });
      });

      // Respond to Stripe immediately
      res.json({ received: true });
    } catch (error) {
      logger.error('Webhook processing error', { error });
      
      // Return 400 for signature verification failures
      if (error instanceof Error && error.message.includes('signature')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid signature',
        });
      }

      next(error);
    }
  }
);

/**
 * GET /api/v1/webhooks/events/:eventId
 * Get webhook event by ID (for debugging)
 */
router.get(
  '/events/:eventId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId } = req.params;

      const event = await webhookService.getWebhookEvent(eventId);

      if (!event) {
        return res.status(404).json({
          success: false,
          error: 'Webhook event not found',
        });
      }

      res.json({
        success: true,
        data: event,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/webhooks/events/:eventId/retry
 * Retry failed webhook event (for debugging/recovery)
 */
router.post(
  '/events/:eventId/retry',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId } = req.params;

      await webhookService.retryWebhookEvent(eventId);

      res.json({
        success: true,
        message: 'Webhook event retried successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/webhooks/events/unprocessed
 * Get unprocessed webhook events (for monitoring)
 */
router.get(
  '/events/unprocessed',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const events = await webhookService.getUnprocessedEvents(limit);

      res.json({
        success: true,
        data: {
          events,
          count: events.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Import express for raw body parser
import express from 'express';

export default router;
