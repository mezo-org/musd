# Design Document - Payment Integration

## Overview

This design document outlines the technical architecture for integrating Stripe's crypto products into MUSD-based dApps. The solution leverages **Stripe Stablecoin Payments** and **Stripe Fiat-to-Crypto Onramp** to provide seamless fiat on-ramp and off-ramp capabilities, enabling users to deposit traditional currency and receive MUSD tokens, or pay with MUSD that settles as fiat.

### Key Design Principles

1. **Leverage Stripe Crypto**: Use Stripe's native stablecoin and onramp products instead of custom escrow
2. **MUSD as Stablecoin**: Integrate MUSD as a supported stablecoin on Stripe's platform
3. **Regulatory Compliance**: Stripe handles KYC/AML compliance automatically
4. **User Experience**: Embedded onramp widget and seamless payment flows
5. **Minimal Custom Infrastructure**: Reduce complexity by using Stripe's managed services
6. **Dual Integration**: Support both stablecoin payments (MUSD → fiat) and onramp (fiat → MUSD)

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User (dApp)                           │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Stripe Onramp   │         │  MUSD Payment    │     │
│  │  Widget          │         │  Flow            │     │
│  │  (Embedded)      │         │                  │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────┬──────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────────────────────────────────────────────┐
│              Stripe Crypto Platform                      │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Fiat-to-Crypto  │         │   Stablecoin     │     │
│  │  Onramp          │         │   Payments       │     │
│  │  - KYC/AML       │         │   - MUSD → Fiat  │     │
│  │  - Payment       │         │   - Settlements  │     │
│  │  - Crypto Send   │         │   - Webhooks     │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────┬──────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────────────────────────────────────────────┐
│              Integration Service (Backend)               │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Webhook Handler │         │  Transaction     │     │
│  │  - Onramp events │         │  Manager         │     │
│  │  - Payment events│         │  - History       │     │
│  └──────────────────┘         │  - Reconciliation│     │
│                                └──────────────────┘     │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Stripe API      │         │   Database       │     │
│  │  Client          │         │   (PostgreSQL)   │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│           Blockchain Layer (Mezo Network)                │
│  ┌──────────────┐         ┌──────────────────┐         │
│  │     MUSD     │         │       PCV        │         │
│  │    Token     │         │     Contract     │         │
│  └──────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

#### Flow 1: Fiat-to-Crypto Onramp (Fiat → MUSD)

**Using Stripe Embedded Onramp Widget**

```
User clicks "Buy MUSD" in dApp
  ↓
dApp creates Stripe Onramp Session via backend
  ↓
Backend calls Stripe API: POST /v1/crypto/onramp_sessions
  {
    transaction_details: {
      destination_currency: 'MUSD',
      destination_network: 'mezo',
      destination_amount: '100'
    },
    customer_wallet_address: '0x...'
  }
  ↓
Stripe Onramp Widget embedded in dApp
  ↓
Stripe handles:
  - KYC/AML verification
  - Payment processing (card, bank transfer)
  - MUSD purchase and transfer
  ↓
Stripe sends MUSD directly to user's wallet
  ↓
Webhook: crypto.onramp_session.completed
  ↓
Backend records transaction in database
  ↓
User has MUSD in wallet, ready to use in dApp
```

#### Flow 2: Stablecoin Payments (MUSD → Fiat Settlement)

**Using Stripe Stablecoin Payment Intent**

```
User wants to pay for service/product with MUSD
  ↓
dApp creates Stripe Payment Intent via backend
  ↓
Backend calls Stripe API: POST /v1/payment_intents
  {
    amount: 10000,  // $100.00 in cents
    currency: 'usd',
    payment_method_types: ['stablecoin'],
    payment_method_options: {
      stablecoin: {
        currency: 'musd',
        network: 'mezo'
      }
    }
  }
  ↓
User approves MUSD transfer from wallet
  ↓
MUSD transferred to Stripe's settlement address
  ↓
Stripe converts MUSD to fiat
  ↓
Fiat settles in merchant's Stripe balance
  ↓
Webhook: payment_intent.succeeded
  ↓
Backend records transaction and fulfills order
```

#### Flow 3: Stablecoin Payouts (Fiat → MUSD Payout)

**Using Stripe Connect Stablecoin Payouts (Private Preview)**

```
Platform wants to pay user in MUSD
  ↓
Backend creates Stripe Payout via API
  ↓
Backend calls Stripe API: POST /v1/payouts
  {
    amount: 10000,  // $100.00 in cents
    currency: 'usd',
    destination: 'connected_account_id',
    method: 'stablecoin',
    stablecoin_options: {
      currency: 'musd',
      network: 'mezo',
      destination_address: '0x...'
    }
  }
  ↓
Stripe converts fiat to MUSD
  ↓
MUSD sent to user's wallet address
  ↓
Webhook: payout.paid
  ↓
Backend records payout transaction
```

## Components and Interfaces

### 1. Integration Service (Backend)

**Technology Stack**: Node.js/TypeScript, Express.js, PostgreSQL

**Responsibilities**:
- Create Stripe Onramp Sessions for fiat-to-crypto
- Create Stripe Payment Intents for stablecoin payments
- Create Stripe Payouts for stablecoin payouts (when available)
- Process Stripe webhooks for all crypto events
- Record transaction history and reconciliation
- Provide transaction status and history APIs

**Key Modules**:

```typescript
// Integration Service Structure
src/
├── api/
│   ├── onramp.ts            // Onramp session creation
│   ├── payments.ts          // Stablecoin payment intents
│   ├── payouts.ts           // Stablecoin payouts
│   ├── transactions.ts      // Transaction history
│   └── webhooks.ts          // Stripe webhook handlers
├── services/
│   ├── stripe-onramp.service.ts      // Onramp API wrapper
│   ├── stripe-payments.service.ts    // Stablecoin payments
│   ├── stripe-payouts.service.ts     // Stablecoin payouts
│   └── transaction.service.ts        // Transaction management
├── models/
│   ├── onramp-session.model.ts       // Onramp session data
│   ├── payment.model.ts              // Payment data
│   ├── payout.model.ts               // Payout data
│   └── user.model.ts                 // User data
└── config/
    ├── stripe.config.ts              // Stripe configuration
    └── supported-currencies.ts       // MUSD configuration
```

**API Endpoints**:

```typescript
// Onramp Endpoints (Fiat → MUSD)
POST   /api/v1/onramp/sessions
  Body: { 
    walletAddress: string,
    destinationAmount?: string,
    sourceAmount?: string,
    sourceCurrency?: string
  }
  Returns: { 
    clientSecret: string,
    sessionId: string,
    url: string  // For redirect flow
  }

GET    /api/v1/onramp/sessions/:id
  Returns: { 
    status: 'initialized' | 'pending' | 'completed' | 'failed',
    transactionDetails: object
  }

GET    /api/v1/onramp/quotes
  Query: { 
    sourceAmount: string,
    sourceCurrency: string,
    destinationCurrency: 'musd'
  }
  Returns: { 
    destinationAmount: string,
    fees: object,
    exchangeRate: string
  }

// Stablecoin Payment Endpoints (MUSD → Fiat)
POST   /api/v1/payments/intents
  Body: { 
    amount: number,  // in cents
    currency: string,
    metadata?: object
  }
  Returns: { 
    clientSecret: string,
    paymentIntentId: string,
    musdAmount: string,
    destinationAddress: string
  }

GET    /api/v1/payments/intents/:id
  Returns: { 
    status: 'requires_payment_method' | 'requires_confirmation' | 
            'processing' | 'succeeded' | 'canceled',
    amount: number,
    musdAmount: string
  }

// Stablecoin Payout Endpoints (Fiat → MUSD)
POST   /api/v1/payouts
  Body: { 
    amount: number,  // in cents
    currency: string,
    destinationAddress: string,
    connectedAccountId?: string
  }
  Returns: { 
    payoutId: string,
    musdAmount: string,
    estimatedArrival: string
  }

GET    /api/v1/payouts/:id
  Returns: { 
    status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled',
    musdAmount: string,
    destinationAddress: string
  }

// Transaction History
GET    /api/v1/transactions
  Query: { 
    page: number,
    limit: number,
    type?: 'onramp' | 'payment' | 'payout',
    status?: string
  }
  Returns: { 
    transactions: Transaction[],
    total: number,
    hasMore: boolean
  }

GET    /api/v1/transactions/export
  Query: { startDate: string, endDate: string }
  Returns: CSV file

// Webhook Endpoint
POST   /api/v1/webhooks/stripe
  Headers: { 'stripe-signature': string }
  Body: Stripe Event
  Returns: { received: true }
```

### 2. Stripe Crypto Configuration

**MUSD Token Configuration**

To enable MUSD on Stripe's crypto platform, the following configuration must be submitted to Stripe:

```json
{
  "token": {
    "symbol": "MUSD",
    "name": "Mezo USD",
    "type": "stablecoin",
    "decimals": 18,
    "networks": [
      {
        "network": "mezo",
        "contractAddress": "0x...",  // MUSD token address on Mezo
        "chainId": "...",             // Mezo chain ID
        "rpcUrl": "https://rpc.mezo.org",
        "explorerUrl": "https://explorer.mezo.org"
      }
    ],
    "peggedTo": "USD",
    "pegMechanism": "collateralized_debt_position",
    "collateralType": "BTC",
    "issuer": {
      "name": "Mezo Foundation",
      "website": "https://mezo.org",
      "documentation": "https://docs.mezo.org"
    }
  },
  "compliance": {
    "kycRequired": true,
    "amlCompliant": true,
    "regulatoryStatus": "compliant"
  },
  "liquidity": {
    "minimumLiquidity": 1000000,  // $1M minimum
    "liquidityProviders": ["..."],
    "tradingPairs": ["MUSD/USD", "MUSD/USDC"]
  }
}
```

**Stripe Settlement Address**

For stablecoin payments, Stripe provides a settlement address where MUSD is sent:

```typescript
interface StripeSettlementConfig {
  network: 'mezo';
  settlementAddress: string;  // Provided by Stripe
  confirmationsRequired: number;  // Typically 6-12
  settlementTime: string;  // e.g., "T+1" or "T+2"
}
```

**No Custom Smart Contract Required**

Unlike the original design, Stripe Crypto handles all the complexity:
- ✅ Stripe manages KYC/AML
- ✅ Stripe handles fiat-to-crypto conversion
- ✅ Stripe provides settlement addresses
- ✅ Stripe manages liquidity and pricing
- ✅ No custom escrow contract needed
- ✅ No mint/burn authorization needed (users receive MUSD directly)

### 4. Database Schema

**Technology**: PostgreSQL with TypeORM

**Tables**:

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    email VARCHAR(255),
    stripe_customer_id VARCHAR(255) UNIQUE,
    preferred_payment_method VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Onramp sessions table (Fiat → MUSD)
CREATE TABLE onramp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'initialized', 'pending', 'completed', 'failed'
    
    -- Source (fiat) details
    source_amount DECIMAL(18, 2),
    source_currency VARCHAR(3),
    
    -- Destination (MUSD) details
    destination_amount DECIMAL(18, 6),
    destination_currency VARCHAR(10) DEFAULT 'musd',
    destination_network VARCHAR(20) DEFAULT 'mezo',
    wallet_address VARCHAR(42) NOT NULL,
    
    -- Transaction details
    tx_hash VARCHAR(66),
    block_number BIGINT,
    
    -- Fees
    network_fee DECIMAL(18, 6),
    transaction_fee DECIMAL(18, 2),
    
    -- Metadata
    client_secret VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_onramp_sessions_user_id ON onramp_sessions(user_id);
CREATE INDEX idx_onramp_sessions_status ON onramp_sessions(status);
CREATE INDEX idx_onramp_sessions_stripe_session_id ON onramp_sessions(stripe_session_id);
CREATE INDEX idx_onramp_sessions_wallet_address ON onramp_sessions(wallet_address);

-- Payment intents table (MUSD → Fiat)
CREATE TABLE payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(30) NOT NULL, -- 'requires_payment_method', 'requires_confirmation', 'processing', 'succeeded', 'canceled'
    
    -- Fiat settlement details
    amount BIGINT NOT NULL,  -- in cents
    currency VARCHAR(3) NOT NULL,
    
    -- MUSD payment details
    musd_amount DECIMAL(18, 6),
    musd_network VARCHAR(20) DEFAULT 'mezo',
    settlement_address VARCHAR(42),
    
    -- Transaction details
    tx_hash VARCHAR(66),
    block_number BIGINT,
    
    -- Metadata
    client_secret VARCHAR(255),
    metadata JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    succeeded_at TIMESTAMP
);

CREATE INDEX idx_payment_intents_user_id ON payment_intents(user_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_stripe_id ON payment_intents(stripe_payment_intent_id);

-- Payouts table (Fiat → MUSD)
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    stripe_payout_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'pending', 'in_transit', 'paid', 'failed', 'canceled'
    
    -- Source (fiat) details
    amount BIGINT NOT NULL,  -- in cents
    currency VARCHAR(3) NOT NULL,
    
    -- Destination (MUSD) details
    musd_amount DECIMAL(18, 6),
    destination_address VARCHAR(42) NOT NULL,
    destination_network VARCHAR(20) DEFAULT 'mezo',
    
    -- Transaction details
    tx_hash VARCHAR(66),
    block_number BIGINT,
    
    -- Connected account (for marketplace payouts)
    connected_account_id VARCHAR(255),
    
    -- Metadata
    estimated_arrival TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP
);

CREATE INDEX idx_payouts_user_id ON payouts(user_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_stripe_id ON payouts(stripe_payout_id);
CREATE INDEX idx_payouts_destination_address ON payouts(destination_address);

-- Webhook events table
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);

-- Quotes table (for rate tracking)
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_amount DECIMAL(18, 2) NOT NULL,
    source_currency VARCHAR(3) NOT NULL,
    destination_amount DECIMAL(18, 6) NOT NULL,
    destination_currency VARCHAR(10) NOT NULL,
    exchange_rate DECIMAL(18, 8) NOT NULL,
    fees JSONB,
    valid_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quotes_currencies ON quotes(source_currency, destination_currency);
CREATE INDEX idx_quotes_created_at ON quotes(created_at);
```

### 3. Frontend Integration (dApp)

**Technology**: React/TypeScript, ethers.js, @stripe/crypto, @stripe/stripe-js

**Stripe Crypto SDK Integration**:

```typescript
// Install dependencies
// npm install @stripe/crypto @stripe/stripe-js

import { loadStripeCrypto } from '@stripe/crypto';
import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe
const stripe = await loadStripe(publishableKey);
const stripeCrypto = await loadStripeCrypto(publishableKey);
```

**Components**:

```typescript
// 1. Onramp Component (Fiat → MUSD)
interface OnrampWidgetProps {
    walletAddress: string;
    onSuccess: (session: OnrampSession) => void;
    onError: (error: Error) => void;
}

const OnrampWidget: React.FC<OnrampWidgetProps> = ({ 
    walletAddress, 
    onSuccess, 
    onError 
}) => {
    const [clientSecret, setClientSecret] = useState<string>();
    
    useEffect(() => {
        // Create onramp session via backend
        fetch('/api/v1/onramp/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
        })
        .then(res => res.json())
        .then(data => setClientSecret(data.clientSecret));
    }, [walletAddress]);
    
    return (
        <div>
            {clientSecret && (
                <CryptoElements stripeOnramp={stripeCrypto}>
                    <OnrampElement
                        clientSecret={clientSecret}
                        appearance={{ theme: 'light' }}
                        onReady={() => console.log('Onramp ready')}
                        onChange={(event) => {
                            if (event.session?.status === 'completed') {
                                onSuccess(event.session);
                            }
                        }}
                    />
                </CryptoElements>
            )}
        </div>
    );
};

// 2. Stablecoin Payment Component (MUSD → Fiat)
interface StablecoinPaymentProps {
    amount: number;  // in cents
    currency: string;
    onSuccess: (paymentIntent: PaymentIntent) => void;
}

const StablecoinPayment: React.FC<StablecoinPaymentProps> = ({ 
    amount, 
    currency, 
    onSuccess 
}) => {
    const [paymentIntent, setPaymentIntent] = useState<any>();
    const { address, signTransaction } = useWallet();
    
    const handlePayment = async () => {
        // Create payment intent
        const response = await fetch('/api/v1/payments/intents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, currency })
        });
        
        const { clientSecret, musdAmount, destinationAddress } = await response.json();
        
        // User approves MUSD transfer from wallet
        const tx = await signTransaction({
            to: destinationAddress,
            value: musdAmount,
            data: '0x'  // MUSD transfer
        });
        
        // Confirm payment with Stripe
        const result = await stripe.confirmStablecoinPayment(clientSecret, {
            transaction_hash: tx.hash
        });
        
        if (result.paymentIntent.status === 'succeeded') {
            onSuccess(result.paymentIntent);
        }
    };
    
    return (
        <button onClick={handlePayment}>
            Pay {amount / 100} {currency.toUpperCase()} with MUSD
        </button>
    );
};

// 3. Payment Method Selector
interface PaymentMethodSelectorProps {
    onSelect: (method: 'onramp' | 'stablecoin' | 'wallet') => void;
    selectedMethod: 'onramp' | 'stablecoin' | 'wallet';
}

// 4. Transaction History Component
interface TransactionHistoryProps {
    userId: string;
    type?: 'onramp' | 'payment' | 'payout';
}

// 5. Quote Display Component
interface QuoteDisplayProps {
    sourceAmount: number;
    sourceCurrency: string;
    destinationCurrency: 'musd';
}
```

## Data Models

### Transaction Model

```typescript
interface Transaction {
    id: string;
    userId: string;
    type: 'deposit' | 'withdrawal';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    
    // Fiat details
    fiatAmount: number;
    fiatCurrency: string;
    
    // MUSD details
    musdAmount: number;
    
    // Fees
    stripeFee: number;
    platformFee: number;
    totalFee: number;
    
    // References
    stripePaymentId?: string;
    stripePayoutId?: string;
    txHash?: string;
    blockNumber?: number;
    
    // Timestamps
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    
    // Error handling
    errorMessage?: string;
    retryCount: number;
}
```

### User Model

```typescript
interface User {
    id: string;
    walletAddress: string;
    email?: string;
    stripeCustomerId?: string;
    kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
    kycVerifiedAt?: Date;
    preferredPaymentMethod?: 'stripe' | 'wallet';
    createdAt: Date;
    updatedAt: Date;
}
```

### Fee Structure

```typescript
interface FeeCalculation {
    // Deposit fees
    depositStripeFee: number;      // 2.9% + $0.30
    depositPlatformFee: number;    // 0% (covered by Stripe fee)
    depositTotalFee: number;
    depositNetMusd: number;
    
    // Withdrawal fees
    withdrawalStripeFee: number;   // Stripe payout fee
    withdrawalPlatformFee: number; // 1% (min $1)
    withdrawalTotalFee: number;
    withdrawalNetFiat: number;
}
```

## Error Handling

### Error Categories

1. **Stripe Errors**
   - Payment declined
   - Insufficient funds
   - Invalid payment method
   - Stripe API errors

2. **Blockchain Errors**
   - Mint/burn transaction failure
   - Gas estimation failure
   - Network congestion
   - Contract paused

3. **KYC Errors**
   - Verification required
   - Verification failed
   - Verification pending

4. **Business Logic Errors**
   - Insufficient balance
   - Daily limit exceeded
   - Invalid amount
   - Reserve ratio below threshold

### Error Handling Strategy

```typescript
class PaymentGatewayError extends Error {
    constructor(
        public code: string,
        public message: string,
        public userMessage: string,
        public retryable: boolean,
        public metadata?: any
    ) {
        super(message);
    }
}

// Error codes
enum ErrorCode {
    // Stripe errors
    STRIPE_PAYMENT_DECLINED = 'STRIPE_PAYMENT_DECLINED',
    STRIPE_API_ERROR = 'STRIPE_API_ERROR',
    
    // Blockchain errors
    MINT_FAILED = 'MINT_FAILED',
    BURN_FAILED = 'BURN_FAILED',
    INSUFFICIENT_GAS = 'INSUFFICIENT_GAS',
    
    // KYC errors
    KYC_REQUIRED = 'KYC_REQUIRED',
    KYC_FAILED = 'KYC_FAILED',
    
    // Business logic errors
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
    DAILY_LIMIT_EXCEEDED = 'DAILY_LIMIT_EXCEEDED',
    AMOUNT_TOO_LOW = 'AMOUNT_TOO_LOW',
    RESERVE_RATIO_LOW = 'RESERVE_RATIO_LOW',
}
```

### Retry Logic

```typescript
interface RetryConfig {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}

const RETRY_CONFIG: Record<string, RetryConfig> = {
    MINT_FAILED: {
        maxRetries: 3,
        initialDelay: 5000,
        maxDelay: 60000,
        backoffMultiplier: 2,
    },
    BURN_FAILED: {
        maxRetries: 3,
        initialDelay: 5000,
        maxDelay: 60000,
        backoffMultiplier: 2,
    },
    STRIPE_API_ERROR: {
        maxRetries: 2,
        initialDelay: 2000,
        maxDelay: 10000,
        backoffMultiplier: 2,
    },
};
```

### Refund Process

```typescript
async function handleFailedDeposit(transaction: Transaction): Promise<void> {
    // If Stripe payment succeeded but minting failed
    if (transaction.stripePaymentId && !transaction.txHash) {
        // Retry minting up to 3 times
        for (let i = 0; i < 3; i++) {
            try {
                await mintMusd(transaction);
                return; // Success
            } catch (error) {
                if (i === 2) {
                    // Final retry failed, initiate refund
                    await initiateStripeRefund(transaction.stripePaymentId);
                    await sendRefundNotification(transaction.userId);
                }
                await delay(RETRY_CONFIG.MINT_FAILED.initialDelay * Math.pow(2, i));
            }
        }
    }
}
```

## Testing Strategy

### Unit Tests

**Coverage Areas**:
- Fee calculation logic
- KYC verification logic
- Transaction state management
- Error handling and retry logic
- Database models and queries

**Tools**: Jest, Mocha

### Integration Tests

**Coverage Areas**:
- Stripe webhook processing
- Escrow contract interaction
- Database transactions
- API endpoint functionality

**Tools**: Jest, Supertest, Hardhat

### Smart Contract Tests

**Coverage Areas**:
- Mint/burn functionality
- Multi-signature authorization
- Reserve ratio calculations
- Event emissions
- Access control
- Pause/unpause functionality

**Tools**: Hardhat, Waffle, Chai

```typescript
describe('FiatEscrow Contract', () => {
    it('should mint MUSD when authorized admin calls mintFromFiat', async () => {
        // Test implementation
    });
    
    it('should burn MUSD when authorized admin calls burnForFiat', async () => {
        // Test implementation
    });
    
    it('should maintain correct reserve ratio', async () => {
        // Test implementation
    });
    
    it('should emit FiatDeposit event with correct parameters', async () => {
        // Test implementation
    });
    
    it('should reject mint when contract is paused', async () => {
        // Test implementation
    });
    
    it('should require 2-of-3 signatures for admin operations', async () => {
        // Test implementation
    });
});
```

### End-to-End Tests

**Coverage Areas**:
- Complete deposit flow (Stripe → MUSD)
- Complete withdrawal flow (MUSD → Stripe)
- KYC verification flow
- Transaction history and reconciliation
- Error scenarios and refunds

**Tools**: Cypress, Playwright

### Security Testing

**Coverage Areas**:
- Smart contract audits (Slither, Mythril)
- Penetration testing
- Webhook signature verification
- SQL injection prevention
- XSS prevention
- Rate limiting
- CSRF protection

## Security Considerations

### Smart Contract Security

1. **Access Control**
   - Multi-signature requirement for admin operations
   - Role-based access control (RBAC)
   - Time-locked admin operations for critical changes

2. **Reentrancy Protection**
   - Use OpenZeppelin's `ReentrancyGuard`
   - Checks-Effects-Interactions pattern

3. **Integer Overflow/Underflow**
   - Solidity 0.8.24 has built-in overflow protection
   - Additional SafeMath for critical calculations

4. **Pausability**
   - Emergency pause functionality
   - Gradual unpause with monitoring

### Backend Security

1. **API Security**
   - JWT authentication
   - Rate limiting (100 requests/minute per user)
   - Input validation and sanitization
   - CORS configuration

2. **Webhook Security**
   - Stripe signature verification
   - Idempotency keys
   - Replay attack prevention

3. **Database Security**
   - Encrypted sensitive data
   - Prepared statements (SQL injection prevention)
   - Regular backups
   - Access logging

4. **Key Management**
   - Hardware Security Module (HSM) for private keys
   - AWS KMS or similar for API keys
   - Key rotation policy

### Compliance and Privacy

1. **KYC/AML**
   - Stripe Identity integration
   - Transaction monitoring
   - Suspicious activity reporting

2. **Data Privacy**
   - GDPR compliance
   - Data encryption at rest and in transit
   - Right to be forgotten implementation
   - Privacy policy and terms of service

3. **Financial Regulations**
   - Money transmitter license (if required)
   - Regular audits
   - Transaction limits and monitoring

## Deployment Strategy

### Phase 1: Development and Testing (Weeks 1-4)
- Set up development environment
- Implement smart contracts
- Implement backend service
- Write comprehensive tests
- Internal testing

### Phase 2: Testnet Deployment (Weeks 5-6)
- Deploy to Mezo testnet
- Deploy backend to staging environment
- Integration testing
- Security audit
- Bug fixes

### Phase 3: Limited Beta (Weeks 7-8)
- Deploy to mainnet with limited access
- Whitelist beta users
- Monitor transactions closely
- Gather feedback
- Performance optimization

### Phase 4: Public Launch (Week 9+)
- Remove access restrictions
- Marketing and documentation
- 24/7 monitoring
- Customer support
- Continuous improvement

## Monitoring and Observability

### Metrics to Track

1. **Business Metrics**
   - Total deposits (count and volume)
   - Total withdrawals (count and volume)
   - Average transaction size
   - Fee revenue
   - Reserve ratio
   - KYC conversion rate

2. **Technical Metrics**
   - API response times
   - Transaction success rate
   - Blockchain confirmation times
   - Error rates by type
   - Retry rates
   - Database query performance

3. **Security Metrics**
   - Failed authentication attempts
   - Suspicious transaction patterns
   - Rate limit violations
   - Webhook verification failures

### Alerting

```typescript
interface Alert {
    severity: 'info' | 'warning' | 'critical';
    category: string;
    message: string;
    metadata: any;
}

// Critical alerts
- Reserve ratio below 100%
- Smart contract paused
- High error rate (>5%)
- Large transaction (>$100k)
- Multiple failed KYC attempts

// Warning alerts
- Reserve ratio below 110%
- High retry rate (>10%)
- Slow API response times (>2s)
- Daily limit approaching

// Info alerts
- New user registration
- Successful large transaction
- Daily reconciliation completed
```

### Logging

```typescript
// Structured logging with Winston
logger.info('Deposit initiated', {
    userId: user.id,
    amount: amount,
    currency: currency,
    stripeSessionId: session.id,
    timestamp: new Date().toISOString(),
});

logger.error('Mint failed', {
    userId: user.id,
    transactionId: transaction.id,
    error: error.message,
    retryCount: transaction.retryCount,
    timestamp: new Date().toISOString(),
});
```

## Integration with MUSD Ecosystem

### Mint/Burn Authorization

The Escrow Contract must be added to the MUSD token's `mintList` and `burnList`:

```solidity
// During deployment or via governance
musdToken.addToMintList(fiatEscrowAddress);
musdToken.addToBurnList(fiatEscrowAddress);
```

### Fee Distribution

Fees collected by the Escrow Contract can be distributed to the PCV contract:

```solidity
function distributeFees() external onlyAdmin {
    uint256 feeBalance = calculateAccumulatedFees();
    musd.transfer(pcvAddress, feeBalance);
}
```

### Reserve Management

The Escrow Contract maintains separate accounting from the main MUSD collateral:

- Fiat reserves are held in Stripe balance
- MUSD minted from fiat is tracked separately
- Reserve ratio must be maintained at 100%+
- Regular reconciliation with Stripe balance

### Governance Integration

Key parameters can be controlled by MUSD governance:

- Fee percentages
- Daily transaction limits
- KYC thresholds
- Admin addresses
- Emergency pause

## Stripe Crypto Product Selection

### Products Used

This integration leverages three Stripe Crypto products:

1. **Fiat-to-Crypto Onramp** (Primary for deposits)
   - Embedded widget for seamless UX
   - Stripe handles KYC/AML
   - Direct MUSD delivery to user wallet
   - Documentation: https://docs.stripe.com/crypto/onramp

2. **Stablecoin Payments** (For merchant payments)
   - Accept MUSD, settle in fiat
   - No volatility risk for merchants
   - Standard Stripe payment flow
   - Documentation: https://docs.stripe.com/payments/stablecoin-payments

3. **Stablecoin Payouts** (For platform payouts - Private Preview)
   - Pay users in MUSD from fiat balance
   - Useful for marketplaces and platforms
   - Documentation: https://docs.stripe.com/connect/stablecoin-payouts

### MUSD Onboarding with Stripe

To enable MUSD on Stripe's platform, work with Stripe to:

1. **Submit Token Information**
   - Token contract address on Mezo
   - Network details (RPC, chain ID, explorer)
   - Liquidity information
   - Compliance documentation

2. **Provide Liquidity**
   - Minimum liquidity requirements
   - Market maker partnerships
   - Trading pair availability (MUSD/USD, MUSD/USDC)

3. **Complete Compliance Review**
   - Token audit reports
   - Regulatory compliance documentation
   - Issuer information

4. **Integration Testing**
   - Testnet integration
   - Transaction testing
   - Settlement verification

### Fee Structure

```typescript
interface StripeCryptoFees {
  onramp: {
    cardPayment: '3.5%',
    bankTransfer: '1.5%',
    applePay: '3.5%',
    networkFee: 'Variable (gas)',
  },
  stablecoinPayments: {
    processingFee: '1.5%',
    settlementTime: 'T+1',
  },
  stablecoinPayouts: {
    payoutFee: '1%',
    settlementTime: 'T+1 to T+2',
  },
}
```

## Future Enhancements

1. **Multi-Currency Support**
   - EUR, GBP, JPY support
   - Dynamic currency conversion

2. **Additional Payment Methods**
   - ACH transfers
   - Wire transfers
   - Apple Pay / Google Pay
   - Stripe Crypto native integration

3. **Instant Withdrawals**
   - Stripe Instant Payouts
   - Higher fees for instant access

4. **Automated Reserve Management**
   - Automatic rebalancing
   - Yield generation on reserves

5. **Advanced KYC**
   - Risk-based verification
   - Enhanced due diligence for high-value users

6. **Mobile App Integration**
   - Native mobile SDKs
   - Biometric authentication

7. **Cross-Chain Support**
   - Bridge integration for other networks
   - Multi-chain MUSD support

## Integration with MUSD Ecosystem

### No Custom Mint/Burn Required

Unlike traditional fiat on-ramps, Stripe Crypto integration does NOT require:
- ❌ Custom escrow smart contracts
- ❌ Adding contracts to MUSD mintList/burnList
- ❌ Managing fiat reserves on-chain
- ❌ Custom mint/burn authorization

Instead, Stripe handles all fiat-crypto conversion off-chain and delivers MUSD directly to user wallets.

### How It Works with MUSD

1. **Onramp Flow**: User buys MUSD with fiat
   - Stripe purchases MUSD from liquidity providers
   - Stripe sends MUSD to user's wallet address
   - No on-chain minting required

2. **Payment Flow**: User pays with MUSD
   - User sends MUSD to Stripe's settlement address
   - Stripe converts MUSD to fiat via liquidity providers
   - Merchant receives fiat in Stripe balance

3. **Payout Flow**: Platform pays user in MUSD
   - Platform initiates payout from Stripe balance
   - Stripe purchases MUSD from liquidity providers
   - Stripe sends MUSD to user's wallet address

### Liquidity Requirements

For Stripe to support MUSD, sufficient liquidity must exist:

```typescript
interface LiquidityRequirements {
  minimumLiquidity: '$1,000,000',  // Minimum trading volume
  tradingPairs: ['MUSD/USD', 'MUSD/USDC'],
  exchanges: ['Centralized DEX', 'Decentralized DEX'],
  marketMakers: ['Market Maker 1', 'Market Maker 2'],
  slippageTolerance: '0.5%',  // Maximum acceptable slippage
}
```

### Fee Distribution

Fees collected by Stripe do not flow to MUSD protocol:
- Stripe keeps transaction fees
- No integration with PCV contract needed
- MUSD protocol earns from its core CDP operations

### Governance Considerations

No governance integration required:
- No protocol parameters to manage
- No admin operations on smart contracts
- Stripe manages all operational aspects

## Conclusion

This design provides a streamlined, compliant, and user-friendly fiat payment integration for MUSD-based dApps by leveraging Stripe's native crypto products. The architecture minimizes custom development by using:

1. **Stripe Fiat-to-Crypto Onramp** for deposits (fiat → MUSD)
2. **Stripe Stablecoin Payments** for merchant payments (MUSD → fiat settlement)
3. **Stripe Stablecoin Payouts** for platform payouts (fiat → MUSD)

Key benefits:
- ✅ No custom smart contracts required
- ✅ Stripe handles all KYC/AML compliance
- ✅ Reduced development and maintenance complexity
- ✅ Leverages Stripe's existing infrastructure and trust
- ✅ Faster time to market
- ✅ Lower operational risk

The integration requires:
1. Backend service to create sessions and handle webhooks
2. Frontend integration of Stripe Crypto widgets
3. Database for transaction tracking and reconciliation
4. Working with Stripe to onboard MUSD as a supported token

This approach is production-ready and aligned with Mezo's goal of making MUSD accessible to non-crypto users while maintaining the security and decentralization of the underlying protocol.
