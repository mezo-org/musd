# Quick Start Guide - MUSD Payment Integration

## 🚀 Get Up and Running in 30 Minutes

### Prerequisites
- Node.js 18+
- pnpm installed
- Stripe account with Crypto Onramp access
- WalletConnect account (free)

## Step 1: Install Dependencies (5 min)

### Backend (Already Done ✅)
```bash
cd payment-service
npm install
```

### Frontend (Need to Do)
```bash
cd dapp
pnpm add @mezo-org/passport @rainbow-me/rainbowkit wagmi viem@2.x @tanstack/react-query @stripe/crypto @stripe/stripe-js
```

## Step 2: Get API Keys (10 min)

### Stripe Keys
1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your keys:
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`

### WalletConnect Project ID
1. Go to https://cloud.walletconnect.com/
2. Create a new project
3. Copy your Project ID

### Stripe Webhook Secret
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `http://localhost:3001/api/v1/webhooks/stripe`
3. Select events: `crypto.onramp_session.*`
4. Copy webhook signing secret: `whsec_...`

## Step 3: Configure Environment (5 min)

### payment-service/.env
```env
NODE_ENV=development
PORT=3001
HOST=localhost

# Database (SQLite for dev)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=musd_payments
DB_USER=postgres
DB_PASSWORD=test

# Stripe (YOUR REAL KEYS)
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE

# MUSD Token
MUSD_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
MUSD_NETWORK=matsnet
MUSD_CHAIN_ID=1234
MUSD_RPC_URL=https://rpc.mezo.org

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### dapp/.env
```env
# WalletConnect (YOUR PROJECT ID)
VITE_WALLETCONNECT_PROJECT_ID=YOUR_PROJECT_ID_HERE

# MUSD Token
VITE_MUSD_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
VITE_MUSD_NETWORK=matsnet
VITE_MUSD_CHAIN_ID=1234

# Payment Service
VITE_PAYMENT_SERVICE_URL=http://localhost:3001

# Stripe (YOUR PUBLISHABLE KEY)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

## Step 4: Implement Mezo Passport (10 min)

Follow the detailed guide in `MEZO_PASSPORT_SETUP.md`, or use these quick files:

### Create: dapp/src/config/mezoPassport.ts
```typescript
import { getConfig, BitcoinWallet } from '@mezo-org/passport';

export const config = getConfig({
  appName: 'MUSD',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
  bitcoinWallet: [
    BitcoinWallet.UNISAT,
    BitcoinWallet.OKX,
    BitcoinWallet.XVERSE,
  ],
});
```

### Create: dapp/src/providers/Web3Provider.tsx
```typescript
import React from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '../config/mezoPassport';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
```

### Update: dapp/src/main.tsx
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Web3Provider } from './providers/Web3Provider';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </React.StrictMode>
);
```

### Create: dapp/src/components/WalletConnect.tsx
```typescript
import { ConnectButton } from '@rainbow-me/rainbowkit';

export const WalletConnect = () => <ConnectButton />;
```

## Step 5: Start Services (2 min)

### Terminal 1: Payment Service
```bash
cd payment-service
npm run dev
```

### Terminal 2: dApp
```bash
cd dapp
pnpm dev
```

## Step 6: Test! (5 min)

1. **Open**: http://localhost:3000
2. **Click**: "Connect Wallet"
3. **Select**: Bitcoin wallet (Unisat, OKX, or Xverse)
4. **Click**: "Buy MUSD with Card"
5. **Use Sandbox Values**:
   - OTP: `000000`
   - SSN: `000000000`
   - Address: `address_full_match`
   - Card: `4242424242424242`
6. **Complete**: Purchase
7. **Verify**: MUSD balance updates

## 🎉 You're Done!

You now have a working fiat-to-MUSD payment integration!

## 📚 Next Steps

- Read `MEZO_PASSPORT_SETUP.md` for detailed component examples
- Read `IMPLEMENTATION_STATUS.md` for full project status
- Read `docs/MEZO_PASSPORT_INTEGRATION.md` for architecture details

## 🐛 Troubleshooting

### Payment service won't start
- Check `.env` file exists
- Verify all required env vars are set
- Check port 3001 is available

### dApp won't start
- Run `pnpm install` in dapp directory
- Check `.env` file exists
- Verify WalletConnect Project ID is set

### Wallet won't connect
- Install a Bitcoin wallet (Unisat, OKX, or Xverse)
- Check WalletConnect Project ID is correct
- Try refreshing the page

### Onramp fails
- Verify Stripe keys are correct (test mode)
- Check payment service is running
- Look at payment service logs for errors

### MUSD not appearing
- Check Matsnet address in wallet
- Verify transaction completed in Stripe Dashboard
- Check webhook events are being received

## 📞 Need Help?

- Check `IMPLEMENTATION_STATUS.md` for current status
- Review `MEZO_PASSPORT_SETUP.md` for detailed setup
- Check payment service logs: `payment-service/logs/`
- Check browser console for frontend errors

## 🔗 Useful Links

- Stripe Dashboard: https://dashboard.stripe.com/
- WalletConnect Cloud: https://cloud.walletconnect.com/
- RainbowKit Docs: https://www.rainbowkit.com/
- Mezo Passport: https://www.npmjs.com/package/@mezo-org/passport
- Wagmi Docs: https://wagmi.sh/
