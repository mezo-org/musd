# MUSD Payment Service

Stripe Crypto payment integration service for MUSD-based dApps.

## Features

- **Fiat-to-Crypto Onramp**: Users can buy MUSD with fiat currency (credit card, bank transfer)
- **Stablecoin Payments**: Accept MUSD payments that settle as fiat
- **Stablecoin Payouts**: Pay users in MUSD from fiat balance
- **Transaction History**: Complete audit trail of all transactions
- **Webhook Handling**: Process Stripe crypto events

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL with TypeORM
- **Payment Provider**: Stripe Crypto
- **Logging**: Winston

## Getting Started

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- Stripe account with Crypto Onramp access
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
```

### Configuration

Edit `.env` file with your Stripe credentials and database configuration:

```env
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=musd_payments
DB_USER=postgres
DB_PASSWORD=your_password

# MUSD Token Configuration
MUSD_TOKEN_ADDRESS=0x...
MUSD_NETWORK=mezo
MUSD_CHAIN_ID=1234
MUSD_RPC_URL=https://rpc.mezo.org
```

### Database Setup

```bash
# Create database
createdb musd_payments

# Run migrations (will be added in task 1.1)
pnpm run migration:run
```

### Development

```bash
# Start development server with hot reload
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start
```

### Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## API Documentation

### Health Check

```
GET /health
```

Returns service health status.

### Onramp Endpoints

```
POST /api/v1/onramp/sessions
GET  /api/v1/onramp/sessions/:id
GET  /api/v1/onramp/quotes
```

### Payment Endpoints

```
POST /api/v1/payments/intents
GET  /api/v1/payments/intents/:id
```

### Payout Endpoints

```
POST /api/v1/payouts
GET  /api/v1/payouts/:id
```

### Transaction Endpoints

```
GET /api/v1/transactions
GET /api/v1/transactions/export
```

### Webhook Endpoint

```
POST /api/v1/webhooks/stripe
```

## Project Structure

```
payment-service/
├── src/
│   ├── api/              # API route handlers
│   ├── config/           # Configuration files
│   ├── middleware/       # Express middleware
│   ├── models/           # Database models
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   └── index.ts          # Application entry point
├── logs/                 # Application logs
├── .env.example          # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Stripe Crypto Integration

This service integrates with three Stripe Crypto products:

1. **Fiat-to-Crypto Onramp**: Embedded widget for buying MUSD
2. **Stablecoin Payments**: Accept MUSD, settle in fiat
3. **Stablecoin Payouts**: Pay users in MUSD from fiat balance

### MUSD Token Configuration

To enable MUSD on Stripe's platform, the token must be onboarded with:
- Token contract address on Mezo network
- Network details (RPC, chain ID, explorer)
- Liquidity information
- Compliance documentation

## Security

- Rate limiting on all endpoints
- Webhook signature verification
- Input validation and sanitization
- Encrypted sensitive data in database
- JWT authentication for API access

## Monitoring

- Structured logging with Winston
- Health check endpoint
- Error tracking and alerting
- Transaction metrics

## License

GPL-3.0

## Support

For issues and questions, please refer to the main MUSD repository.
