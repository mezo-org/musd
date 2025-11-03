import { stripe } from '../config/stripe.config';
import { AppDataSource } from '../config/database';
import { OnrampSession } from '../models/OnrampSession';
import { User } from '../models/User';
import { Quote } from '../models/Quote';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import Stripe from 'stripe';

export class OnrampService {
  private onrampSessionRepository = AppDataSource.getRepository(OnrampSession);
  private userRepository = AppDataSource.getRepository(User);
  private quoteRepository = AppDataSource.getRepository(Quote);

  /**
   * Create a new onramp session for fiat-to-MUSD conversion
   */
  async createSession(params: {
    walletAddress: string;
    destinationAmount?: string;
    sourceAmount?: string;
    sourceCurrency?: string;
    userId?: string;
  }): Promise<{
    clientSecret: string;
    sessionId: string;
    url: string;
  }> {
    try {
      const {
        walletAddress,
        destinationAmount,
        sourceAmount,
        sourceCurrency = 'usd',
        userId,
      } = params;

      // Validate wallet address format
      if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new AppError(400, 'Invalid wallet address format');
      }

      // Get or create user
      let user: User | null = null;
      if (userId) {
        user = await this.userRepository.findOne({ where: { id: userId } });
      } else {
        user = await this.userRepository.findOne({ where: { walletAddress } });
      }

      if (!user) {
        user = this.userRepository.create({
          walletAddress,
        });
        await this.userRepository.save(user);
        logger.info('Created new user', { userId: user.id, walletAddress });
      }

      // Create Stripe onramp session
      // Note: Using any type for now as Stripe Crypto types may not be fully available
      const transactionDetails: any = {
        destination_currency: 'musd',
        destination_network: 'mezo',
        wallet_address: walletAddress,
      };

      // Add amount if specified
      if (destinationAmount) {
        transactionDetails.destination_amount = destinationAmount;
      } else if (sourceAmount) {
        transactionDetails.source_amount = sourceAmount;
        transactionDetails.source_currency = sourceCurrency;
      }

      // Using stripe.request for Crypto API until types are available
      const stripeSession: any = await (stripe as any).crypto.onrampSessions.create({
        transaction_details: transactionDetails,
      });

      // Save session to database
      const session = this.onrampSessionRepository.create({
        userId: user.id,
        stripeSessionId: stripeSession.id,
        status: 'initialized',
        walletAddress,
        sourceCurrency,
        sourceAmount: sourceAmount ? parseFloat(sourceAmount) : undefined,
        destinationAmount: destinationAmount ? parseFloat(destinationAmount) : undefined,
        destinationCurrency: 'musd',
        destinationNetwork: 'mezo',
        clientSecret: stripeSession.client_secret,
      });

      await this.onrampSessionRepository.save(session);

      logger.info('Created onramp session', {
        sessionId: session.id,
        stripeSessionId: stripeSession.id,
        walletAddress,
      });

      return {
        clientSecret: stripeSession.client_secret,
        sessionId: session.id,
        url: stripeSession.url || '',
      };
    } catch (error) {
      logger.error('Error creating onramp session', { error });
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'Failed to create onramp session');
    }
  }

  /**
   * Get onramp session by ID
   */
  async getSession(sessionId: string): Promise<OnrampSession> {
    const session = await this.onrampSessionRepository.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });

    if (!session) {
      throw new AppError(404, 'Onramp session not found');
    }

    // Fetch latest status from Stripe
    try {
      const stripeSession: any = await (stripe as any).crypto.onrampSessions.retrieve(
        session.stripeSessionId
      );

      // Update session if status changed
      if (stripeSession.status !== session.status) {
        session.status = stripeSession.status as any;
        
        // Update transaction details if available
        if (stripeSession.transaction_details) {
          const txDetails = stripeSession.transaction_details;
          session.sourceAmount = txDetails.source_amount 
            ? parseFloat(txDetails.source_amount) 
            : session.sourceAmount;
          session.sourceCurrency = txDetails.source_currency || session.sourceCurrency;
          session.destinationAmount = txDetails.destination_amount 
            ? parseFloat(txDetails.destination_amount) 
            : session.destinationAmount;
          session.networkFee = txDetails.network_fee_amount 
            ? parseFloat(txDetails.network_fee_amount) 
            : session.networkFee;
          session.transactionFee = txDetails.transaction_fee_amount 
            ? parseFloat(txDetails.transaction_fee_amount) 
            : session.transactionFee;
        }

        if (stripeSession.status === 'completed') {
          session.completedAt = new Date();
        }

        await this.onrampSessionRepository.save(session);
      }
    } catch (error) {
      logger.error('Error fetching Stripe session', { error, sessionId });
    }

    return session;
  }

  /**
   * Get quote for fiat-to-MUSD conversion
   */
  async getQuote(params: {
    sourceAmount: string;
    sourceCurrency: string;
    destinationCurrency: string;
  }): Promise<{
    destinationAmount: string;
    exchangeRate: string;
    fees: {
      networkFee: string;
      transactionFee: string;
      totalFee: string;
    };
  }> {
    try {
      const { sourceAmount, sourceCurrency, destinationCurrency } = params;

      // Note: Stripe Crypto Onramp doesn't have a direct quote API
      // This is a simplified implementation
      // In production, you would integrate with Stripe's pricing or use market rates

      const amount = parseFloat(sourceAmount);
      
      // Simplified fee calculation (3.5% for card payments)
      const feePercentage = 0.035;
      const transactionFee = amount * feePercentage;
      const networkFee = 0.5; // Estimated network fee in USD
      const totalFee = transactionFee + networkFee;
      
      // Simplified exchange rate (1 USD = 1 MUSD minus fees)
      const netAmount = amount - totalFee;
      const destinationAmount = netAmount;
      const exchangeRate = 1.0;

      // Save quote to database
      const quote = this.quoteRepository.create({
        sourceAmount: amount,
        sourceCurrency,
        destinationAmount,
        destinationCurrency,
        exchangeRate,
        fees: {
          networkFee: networkFee.toString(),
          transactionFee: transactionFee.toString(),
          totalFee: totalFee.toString(),
        },
        validUntil: new Date(Date.now() + 60000), // Valid for 60 seconds
      });

      await this.quoteRepository.save(quote);

      return {
        destinationAmount: destinationAmount.toFixed(6),
        exchangeRate: exchangeRate.toFixed(8),
        fees: {
          networkFee: networkFee.toFixed(2),
          transactionFee: transactionFee.toFixed(2),
          totalFee: totalFee.toFixed(2),
        },
      };
    } catch (error) {
      logger.error('Error getting quote', { error });
      throw new AppError(500, 'Failed to get quote');
    }
  }

  /**
   * Update session status from webhook
   */
  async updateSessionFromWebhook(
    stripeSessionId: string,
    status: string,
    transactionDetails?: any
  ): Promise<void> {
    const session = await this.onrampSessionRepository.findOne({
      where: { stripeSessionId },
    });

    if (!session) {
      logger.warn('Session not found for webhook', { stripeSessionId });
      return;
    }

    session.status = status as any;

    if (transactionDetails) {
      session.sourceAmount = transactionDetails.source_amount 
        ? parseFloat(transactionDetails.source_amount) 
        : session.sourceAmount;
      session.sourceCurrency = transactionDetails.source_currency || session.sourceCurrency;
      session.destinationAmount = transactionDetails.destination_amount 
        ? parseFloat(transactionDetails.destination_amount) 
        : session.destinationAmount;
      session.txHash = transactionDetails.transaction_hash || session.txHash;
      session.networkFee = transactionDetails.network_fee_amount 
        ? parseFloat(transactionDetails.network_fee_amount) 
        : session.networkFee;
      session.transactionFee = transactionDetails.transaction_fee_amount 
        ? parseFloat(transactionDetails.transaction_fee_amount) 
        : session.transactionFee;
    }

    if (status === 'completed') {
      session.completedAt = new Date();
    }

    await this.onrampSessionRepository.save(session);

    logger.info('Updated session from webhook', {
      sessionId: session.id,
      status,
    });
  }

  /**
   * Get user's onramp history
   */
  async getUserSessions(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ sessions: OnrampSession[]; total: number }> {
    const [sessions, total] = await this.onrampSessionRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { sessions, total };
  }
}

export const onrampService = new OnrampService();
