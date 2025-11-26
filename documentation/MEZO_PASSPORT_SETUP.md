# Mezo Passport + RainbowKit Setup Guide

## Overview

Mezo Passport is built on top of RainbowKit, which is a React library for wallet connections. This guide shows how to integrate both into the MUSD dapp.

## Installation

### From the root of the monorepo:

```bash
# Install in the dapp workspace
pnpm add @mezo-org/passport @rainbow-me/rainbowkit wagmi viem@2.x @tanstack/react-query --filter dapp
```

Or from the dapp directory:

```bash
cd dapp
pnpm add @mezo-org/passport @rainbow-me/rainbowkit wagmi viem@2.x @tanstack/react-query
```

## Project Structure

```
musd/
├── dapp/
│   ├── src/
│   │   ├── config/
│   │   │   └── mezoPassport.ts          # Mezo Passport configuration
│   │   ├── components/
│   │   │   ├── WalletConnect.tsx        # Wallet connection button
│   │   │   ├── OnrampWidget.tsx         # Updated with Mezo Passport
│   │   │   └── MUSDBalance.tsx          # Display MUSD balance
│   │   ├── hooks/
│   │   │   ├── useWalletInfo.ts         # Bitcoin + Matsnet info
│   │   │   ├── useMUSDBalance.ts        # Check MUSD balance
│   │   │   └── useSendMUSD.ts           # Send MUSD transactions
│   │   ├── providers/
│   │   │   └── Web3Provider.tsx         # Wrap app with providers
│   │   └── main.tsx                     # Entry point (updated)
│   └── package.json
├── payment-service/                      # Already complete ✅
└── solidity/                             # MUSD contracts
```

## Implementation Steps

### 1. Create Mezo Passport Configuration

**File: `dapp/src/config/mezoPassport.ts`**

```typescript
import { getConfig, BitcoinWallet } from '@mezo-org/passport';

// Get WalletConnect project ID from https://cloud.walletconnect.com/
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

if (!projectId) {
  console.warn('WalletConnect Project ID not found. Get one at https://cloud.walletconnect.com/');
}

export const config = getConfig({
  appName: 'MUSD - Mezo USD',
  projectId,
  
  // Support all Bitcoin wallets
  bitcoinWallet: [
    BitcoinWallet.UNISAT,
    BitcoinWallet.OKX,
    BitcoinWallet.XVERSE,
  ],
  
  // Optional: Customize chains if needed
  // chains: [matsnet],
});
```

### 2. Create Web3 Provider Wrapper

**File: `dapp/src/providers/Web3Provider.tsx`**

```typescript
import React from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '../config/mezoPassport';

// Import RainbowKit styles
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

interface Web3ProviderProps {
  children: React.ReactNode;
}

export const Web3Provider: React.FC<Web3ProviderProps> = ({ children }) => {
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

### 3. Update Main Entry Point

**File: `dapp/src/main.tsx`**

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

### 4. Create Wallet Connection Component

**File: `dapp/src/components/WalletConnect.tsx`**

```typescript
import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

/**
 * Wallet connection button using RainbowKit
 * Supports both Bitcoin wallets (via Mezo Passport) and EVM wallets
 */
export const WalletConnect: React.FC = () => {
  return (
    <ConnectButton 
      chainStatus="icon"
      showBalance={true}
    />
  );
};
```

### 5. Create Wallet Info Hook

**File: `dapp/src/hooks/useWalletInfo.ts`**

```typescript
import { useBitcoinAccount } from '@mezo-org/passport';
import { useAccount, useBalance } from 'wagmi';

/**
 * Get information about connected wallets
 * Returns both Bitcoin wallet info and Matsnet smart account info
 */
export const useWalletInfo = () => {
  // Bitcoin wallet info (original wallet)
  const { 
    address: btcAddress, 
    balance: btcBalance 
  } = useBitcoinAccount();
  
  // Matsnet smart account info (backing account)
  const { 
    address: matsnetAddress,
    isConnected,
    connector,
  } = useAccount();
  
  const { data: matsnetBalance } = useBalance({ 
    address: matsnetAddress 
  });
  
  return {
    isConnected,
    connector: connector?.name,
    bitcoin: {
      address: btcAddress,
      balance: btcBalance, // in satoshis
      balanceBTC: btcBalance ? btcBalance / 100000000 : 0,
    },
    matsnet: {
      address: matsnetAddress,
      balance: matsnetBalance?.value,
      formatted: matsnetBalance?.formatted,
      symbol: matsnetBalance?.symbol,
    },
  };
};
```

### 6. Create MUSD Balance Hook

**File: `dapp/src/hooks/useMUSDBalance.ts`**

```typescript
import { useReadContract, useAccount } from 'wagmi';
import { formatUnits } from 'viem';

const MUSD_TOKEN_ADDRESS = import.meta.env.VITE_MUSD_TOKEN_ADDRESS as `0x${string}`;

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Get MUSD balance for the connected wallet's smart account
 */
export const useMUSDBalance = () => {
  const { address } = useAccount();

  const { 
    data: balance, 
    isLoading, 
    error,
    refetch,
  } = useReadContract({
    address: MUSD_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  return {
    balance,
    formatted: balance ? formatUnits(balance, 18) : '0',
    isLoading,
    error,
    refetch,
  };
};
```

### 7. Create Send MUSD Hook

**File: `dapp/src/hooks/useSendMUSD.ts`**

```typescript
import { useSendTransaction } from '@mezo-org/passport';
import { encodeFunctionData, parseUnits } from 'viem';

const MUSD_TOKEN_ADDRESS = import.meta.env.VITE_MUSD_TOKEN_ADDRESS as `0x${string}`;

const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Send MUSD tokens
 * User signs with Bitcoin wallet, smart account executes transaction
 */
export const useSendMUSD = () => {
  const { sendTransaction, isPending, error } = useSendTransaction();

  const sendMUSD = async (to: string, amount: string) => {
    if (!to || !amount) {
      throw new Error('Recipient address and amount are required');
    }

    // Encode the transfer function call
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to as `0x${string}`, parseUnits(amount, 18)],
    });

    // Send transaction
    // User will sign with their Bitcoin wallet
    // Smart account will execute the transaction
    const hash = await sendTransaction({
      to: MUSD_TOKEN_ADDRESS,
      data,
      value: 0n,
    });

    return hash;
  };

  return {
    sendMUSD,
    isPending,
    error,
  };
};
```

### 8. Create MUSD Balance Display Component

**File: `dapp/src/components/MUSDBalance.tsx`**

```typescript
import React from 'react';
import { useMUSDBalance } from '../hooks/useMUSDBalance';
import { useWalletInfo } from '../hooks/useWalletInfo';

export const MUSDBalance: React.FC = () => {
  const { isConnected, matsnet } = useWalletInfo();
  const { formatted, isLoading, refetch } = useMUSDBalance();

  if (!isConnected) {
    return null;
  }

  return (
    <div className="musd-balance">
      <h3>MUSD Balance</h3>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <>
          <p className="balance">{formatted} MUSD</p>
          <p className="address">
            Smart Account: {matsnet.address?.slice(0, 6)}...{matsnet.address?.slice(-4)}
          </p>
          <button onClick={() => refetch()}>Refresh</button>
        </>
      )}
    </div>
  );
};
```

### 9. Update OnrampWidget to Use Matsnet Address

**File: `dapp/src/components/OnrampWidget.tsx` (Updated)**

```typescript
import React, { useEffect, useState } from 'react';
import { loadStripeCrypto } from '@stripe/crypto';
import { useAccount } from 'wagmi';
import { useBitcoinAccount } from '@mezo-org/passport';

interface OnrampWidgetProps {
  onSuccess?: (session: any) => void;
  onError?: (error: Error) => void;
  sourceAmount?: string;
  sourceCurrency?: string;
}

export const OnrampWidget: React.FC<OnrampWidgetProps> = ({
  onSuccess,
  onError,
  sourceAmount,
  sourceCurrency = 'usd',
}) => {
  // Get Matsnet smart account address (where MUSD will be sent)
  const { address: matsnetAddress } = useAccount();
  
  // Get Bitcoin wallet address (for display)
  const { address: btcAddress } = useBitcoinAccount();
  
  const [clientSecret, setClientSecret] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!matsnetAddress) {
      setError('Please connect your wallet first');
      setLoading(false);
      return;
    }

    createOnrampSession();
  }, [matsnetAddress, sourceAmount]);

  const createOnrampSession = async () => {
    try {
      setLoading(true);
      setError(undefined);

      // Create onramp session with Matsnet smart account address
      // MUSD will be sent here
      const response = await fetch(
        `${import.meta.env.VITE_PAYMENT_SERVICE_URL}/api/v1/onramp/sessions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: matsnetAddress, // Smart account receives MUSD
            sourceAmount,
            sourceCurrency,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create onramp session');
      }

      const data = await response.json();
      setClientSecret(data.data.clientSecret);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clientSecret) return;

    const initializeOnramp = async () => {
      try {
        const stripeCrypto = await loadStripeCrypto(
          import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
        );

        if (!stripeCrypto) {
          throw new Error('Failed to load Stripe Crypto');
        }

        const onrampElement = stripeCrypto.createOnrampElement({
          clientSecret,
          appearance: {
            theme: 'light',
          },
        });

        onrampElement.mount('#onramp-element');

        onrampElement.on('onramp_session_updated', (event) => {
          console.log('Onramp session updated:', event);
          
          if (event.session.status === 'completed') {
            onSuccess?.(event.session);
          }
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    initializeOnramp();
  }, [clientSecret, onSuccess, onError]);

  if (!matsnetAddress) {
    return (
      <div className="onramp-widget-error">
        <p>Please connect your wallet to buy MUSD</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="onramp-widget-loading">
        <div className="spinner"></div>
        <p>Loading payment options...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="onramp-widget-error">
        <p>Error: {error}</p>
        <button onClick={createOnrampSession}>Retry</button>
      </div>
    );
  }

  return (
    <div className="onramp-widget">
      <div className="wallet-info">
        <p>Bitcoin Wallet: {btcAddress?.slice(0, 8)}...{btcAddress?.slice(-6)}</p>
        <p>MUSD will be sent to your smart account</p>
      </div>
      <div id="onramp-element"></div>
    </div>
  );
};
```

### 10. Update Environment Variables

**File: `dapp/.env`**

```env
# WalletConnect (required for RainbowKit)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_from_walletconnect_cloud

# MUSD Token Configuration
VITE_MUSD_TOKEN_ADDRESS=0x... # MUSD token address on Matsnet
VITE_MUSD_NETWORK=matsnet
VITE_MUSD_CHAIN_ID=1234

# Payment Service
VITE_PAYMENT_SERVICE_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 11. Update App.tsx to Use Components

**File: `dapp/src/App.tsx`**

```typescript
import React from 'react';
import { WalletConnect } from './components/WalletConnect';
import { MUSDBalance } from './components/MUSDBalance';
import { BuyMUSDButton } from './components/BuyMUSDButton';
import { useWalletInfo } from './hooks/useWalletInfo';
import './App.css';

function App() {
  const { isConnected, bitcoin, matsnet } = useWalletInfo();

  return (
    <div className="App">
      <header>
        <h1>MUSD Payment Integration</h1>
        <WalletConnect />
      </header>

      <main>
        {isConnected ? (
          <>
            <section className="wallet-info">
              <h2>Connected Wallets</h2>
              <div className="wallet-details">
                <div>
                  <h3>Bitcoin Wallet</h3>
                  <p>{bitcoin.address}</p>
                  <p>{bitcoin.balanceBTC} BTC</p>
                </div>
                <div>
                  <h3>Matsnet Smart Account</h3>
                  <p>{matsnet.address}</p>
                  <p>{matsnet.formatted} {matsnet.symbol}</p>
                </div>
              </div>
            </section>

            <section className="musd-section">
              <MUSDBalance />
              <BuyMUSDButton 
                walletAddress={matsnet.address || ''}
                amount="100"
              />
            </section>
          </>
        ) : (
          <section className="connect-prompt">
            <h2>Connect Your Wallet</h2>
            <p>Connect your Bitcoin wallet to get started with MUSD</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
```

## Testing the Integration

### 1. Start the Payment Service

```bash
cd payment-service
npm run dev
```

### 2. Start the dApp

```bash
cd dapp
pnpm dev
```

### 3. Test Flow

1. **Connect Wallet**
   - Click "Connect Wallet"
   - Select Bitcoin wallet (Unisat, OKX, or Xverse)
   - Approve connection
   - Verify smart account is created

2. **Buy MUSD**
   - Click "Buy MUSD with Card"
   - Complete Stripe Onramp flow
   - Use sandbox values for testing
   - Verify MUSD appears in balance

3. **Send MUSD**
   - Use `useSendMUSD` hook
   - Sign with Bitcoin wallet
   - Verify transaction executes via smart account

## Key Points

✅ **Mezo Passport** handles Bitcoin ↔ Matsnet bridge
✅ **RainbowKit** provides beautiful wallet UI
✅ **Wagmi** handles all blockchain interactions
✅ **Smart Account** receives and holds MUSD
✅ **Bitcoin Wallet** signs all transactions

## Resources

- Get WalletConnect Project ID: https://cloud.walletconnect.com/
- RainbowKit Docs: https://www.rainbowkit.com/
- Mezo Passport: https://www.npmjs.com/package/@mezo-org/passport
- Wagmi Docs: https://wagmi.sh/
