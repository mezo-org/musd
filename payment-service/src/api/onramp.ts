import { Router, Request, Response, NextFunction } from 'express';
import { onrampService } from '../services/onramp.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/onramp/sessions
 * Create a new onramp session
 */
router.post(
  '/sessions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        walletAddress,
        destinationAmount,
        sourceAmount,
        sourceCurrency,
      } = req.body;

      // Validation
      if (!walletAddress) {
        throw new AppError(400, 'walletAddress is required');
      }

      if (!destinationAmount && !sourceAmount) {
        throw new AppError(
          400,
          'Either destinationAmount or sourceAmount must be provided'
        );
      }

      const result = await onrampService.createSession({
        walletAddress,
        destinationAmount,
        sourceAmount,
        sourceCurrency,
        userId: (req as any).userId, // From auth middleware (to be implemented)
      });

      logger.info('Onramp session created', {
        sessionId: result.sessionId,
        walletAddress,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/onramp/sessions/:id
 * Get onramp session by ID
 */
router.get(
  '/sessions/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const session = await onrampService.getSession(id);

      res.json({
        success: true,
        data: {
          id: session.id,
          status: session.status,
          walletAddress: session.walletAddress,
          sourceAmount: session.sourceAmount,
          sourceCurrency: session.sourceCurrency,
          destinationAmount: session.destinationAmount,
          destinationCurrency: session.destinationCurrency,
          destinationNetwork: session.destinationNetwork,
          txHash: session.txHash,
          networkFee: session.networkFee,
          transactionFee: session.transactionFee,
          createdAt: session.createdAt,
          completedAt: session.completedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/onramp/quotes
 * Get quote for fiat-to-MUSD conversion
 */
router.get(
  '/quotes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        sourceAmount,
        sourceCurrency = 'usd',
        destinationCurrency = 'musd',
      } = req.query;

      // Validation
      if (!sourceAmount) {
        throw new AppError(400, 'sourceAmount is required');
      }

      const quote = await onrampService.getQuote({
        sourceAmount: sourceAmount as string,
        sourceCurrency: sourceCurrency as string,
        destinationCurrency: destinationCurrency as string,
      });

      res.json({
        success: true,
        data: quote,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/onramp/history
 * Get user's onramp history
 */
router.get(
  '/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId; // From auth middleware
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        throw new AppError(401, 'Authentication required');
      }

      const result = await onrampService.getUserSessions(userId, page, limit);

      res.json({
        success: true,
        data: {
          sessions: result.sessions,
          pagination: {
            page,
            limit,
            total: result.total,
            pages: Math.ceil(result.total / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
