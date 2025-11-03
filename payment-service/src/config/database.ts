import { DataSource } from 'typeorm';
import { config } from './index';
import { User } from '../models/User';
import { OnrampSession } from '../models/OnrampSession';
import { PaymentIntent } from '../models/PaymentIntent';
import { Payout } from '../models/Payout';
import { WebhookEvent } from '../models/WebhookEvent';
import { Quote } from '../models/Quote';

export const AppDataSource = new DataSource({
  type: config.nodeEnv === 'development' ? 'sqlite' : 'postgres',
  // SQLite configuration for development
  database: config.nodeEnv === 'development' ? './dev.sqlite' : config.database.name,
  // PostgreSQL configuration for production
  ...(config.nodeEnv !== 'development' && {
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.password,
  }),
  synchronize: config.nodeEnv === 'development', // Auto-sync in development only
  logging: config.nodeEnv === 'development',
  entities: [
    User,
    OnrampSession,
    PaymentIntent,
    Payout,
    WebhookEvent,
    Quote,
  ],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: [],
});

export const initializeDatabase = async () => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};
