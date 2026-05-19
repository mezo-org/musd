import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { initializeDatabase } from './config/database';

// Import routes
import onrampRoutes from './api/onramp';
import webhooksRoutes from './api/webhooks';
// import paymentsRoutes from './api/payments';
// import payoutsRoutes from './api/payouts';
// import transactionsRoutes from './api/transactions';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1/onramp', onrampRoutes);
app.use('/api/v1/webhooks', webhooksRoutes);
// app.use('/api/v1/payments', paymentsRoutes);
// app.use('/api/v1/payouts', payoutsRoutes);
// app.use('/api/v1/transactions', transactionsRoutes);

// Error handling
app.use(errorHandler);

// Initialize database and start server
const PORT = config.port;
const HOST = config.host;

async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Start server
    app.listen(PORT, HOST, () => {
      logger.info(`Payment service running on http://${HOST}:${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();

export default app;
