import Stripe from 'stripe';
import { config } from './index';

// Initialize Stripe client
export const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
  typescript: true,
});

// MUSD token configuration for Stripe Crypto
export const musdTokenConfig = {
  symbol: 'MUSD',
  name: 'Mezo USD',
  decimals: 18,
  network: config.musd.network,
  contractAddress: config.musd.tokenAddress,
  chainId: config.musd.chainId,
  rpcUrl: config.musd.rpcUrl,
};

// Stripe Crypto configuration
export const stripeCryptoConfig = {
  onramp: {
    destinationCurrency: 'musd',
    destinationNetwork: config.musd.network,
  },
  stablecoinPayments: {
    currency: 'musd',
    network: config.musd.network,
  },
  stablecoinPayouts: {
    currency: 'musd',
    network: config.musd.network,
  },
};

// Fee structure
export const feeStructure = {
  onramp: {
    cardPayment: 0.035, // 3.5%
    bankTransfer: 0.015, // 1.5%
    applePay: 0.035, // 3.5%
  },
  stablecoinPayments: {
    processingFee: 0.015, // 1.5%
  },
  stablecoinPayouts: {
    payoutFee: 0.01, // 1%
  },
};
