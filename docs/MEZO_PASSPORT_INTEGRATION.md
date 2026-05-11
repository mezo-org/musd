# Mezo Passport Integration Guide

## Overview

Mezo Passport is **essential** for the MUSD payment integration. It enables Bitcoin wallets to interact with MUSD on the Mezo Matsnet (EVM-compatible chain), creating a seamless experience for users.

## Why Mezo Passport is Critical

### The Problem Without It:
- MUSD exists on Matsnet (EVM chain)
- Users have Bitcoin wallets (Unisat, OKX, Xverse)
- Bitcoin wallets can't directly interact with EVM chains
- Users would need separate Matsnet wallets

### The Solution With Mezo Passport:
- Bitcoin wallets can "masquerade" as Matsnet wallets
- Each Bitcoin wallet gets a backing smart account on Matsnet
- Users sign with their Bitcoin wallet
- Smart account executes MUSD transactions on Matsnet
- **One wallet for everything**

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User's Bitcoin Wallet                 │
│              (Unisat, OKX, Xverse, etc.)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Mezo Passport Layer                     │
│  - Wallet Connection (RainbowKit + Bitcoin wallets)     │
│  - Signature Routing (Bitcoin wallet signs)             │
│  - Provider Management (Matsnet operations)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Smart Account on Matsnet                      │
│  - Validates Bitcoin wallet signatures                   │
│  - Executes MUSD transactions                           │
│  - Handles EVM operations                               │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  MUSD Token Contract                     │
│                    (on Matsnet)                          │
└─────────────────────────────────────────────────────────┘
```

## Integration with Our Payment Flow

### Current Payment Integration:
```
Stripe Fiat → MUSD (minted) → ??? (needs wallet)
```

### With Mezo Passport:
```
Stripe Fiat → MUSD (minted) → Mezo Passport → Bitcoin Wallet
                                              ↓
                                    Smart Account (Matsnet)
                                              ↓
                                    MUSD Balance Available
```

## Installation

```bash
# In the dapp directory
pnpm add @mezo-org/passport @rainbow-me/rainbowkit wagmi viem@2.x @tanstack/react-query
```

## Configuration

### 1. Create Mezo Passport Config

```typescript
// dapp/src/config/mezoPassport.ts
import { getConfig } from '@mezo-org/passport';
import { BitcoinWallet } from '@mezo-org/passport';

export const config = getConfig({
  appName: 'MUSD Payment Integration',
  projectId: process.env.VITE_WALLETCONNECT_PROJECT_ID || '',
  
  // Specify which Bitcoin wallets to support
  bitcoinWallet: [
    BitcoinWallet.UNISAT,
    BitcoinWallet.OKX,
    BitcoinWallet.XVERSE,
  ],
});
```

### 2. Wrap App with Providers

```typescript
// dapp/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from './config/mezoPassport';
import App from './App';

import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
```

## Usage in Components

### 1. Connect Wallet Button

```typescript
// dapp/src/components/WalletConnect.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';

export const WalletConnect = () => {
  return <ConnectButton />;
};
```

### 2. Get Bitcoin Account Info

```typescript
// dapp/src/hooks/useWalletInfo.ts
import { useBitcoinAccount } from '@mezo-org/passport';
import { useAccount, useBalance } from 'wagmi';

export const useWalletInfo = () => {
  // Bitcoin account info
  const { address: btcAddress, balance: btcBalance } = useBitcoinAccount();
  
  // Matsnet account info (underlying smart account)
  const { address: matsnetAddress } = useAccount();
  const { data: matsnetBalance } = useBalance({ address: matsnetAddress });
  
  return {
    bitcoin: {
      address: btcAddress,
      balance: btcBalance, // in satoshis
    },
    matsnet: {
      address: matsnetAddress,
      balance: matsnetBalance,
    },
  };
};
```

### 3. Updated OnrampWidget with Mezo Passport

```typescript
// dapp/src/components/OnrampWidget.tsx
import React, { useEffect, useState } from 'react';
import { loadStripeCrypto } from '@stripe/crypto';
import { useAccount } from 'wagmi';
import { useBitcoinAccount } from '@mezo-org/passport';

export const OnrampWidget: React.FC = () => {
  const { address: matsnetAddress } = useAccount(); // Smart account address
  const { address: btcAddress } = useBitcoinAccount(); // Bitcoin address
  const [clientSecret, setClientSecret] = useState<string>();

  useEffect(() => {
    if (!matsnetAddress) return;

    // Create onramp session with Matsnet address
    // MUSD will be sent to the smart account
    createOnrampSession(matsnetAddress);
  }, [matsnetAddress]);

  // ... rest of component
};
```

### 4. Send MUSD Transaction

```typescript
// dapp/src/hooks/useSendMUSD.ts
import { useSendTransaction } from '@mezo-org/passport';
import { parseEther } from 'viem';

export const useSendMUSD = () => {
  const { sendTransaction } = useSendTransaction();

  const sendMUSD = async (to: string, amount: string) => {
    // This will:
    // 1. Create transaction on Matsnet
    // 2. Route signing to Bitcoin wallet
    // 3. Execute via smart account
    const hash = await sendTransaction({
      to: MUSD_TOKEN_ADDRESS,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, parseEther(amount)],
      }),
      value: 0n,
    });

    return hash;
  };

  return { sendMUSD };
};
```

### 5. Check MUSD Balance

```typescript
// dapp/src/hooks/useMUSDBalance.ts
import { useReadContract, useAccount } from 'wagmi';

const MUSD_TOKEN_ADDRESS = process.env.VITE_MUSD_TOKEN_ADDRESS;

export const useMUSDBalance = () => {
  const { address } = useAccount(); // Smart account address

  const { data: balance } = useReadContract({
    address: MUSD_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  return balance;
};
```

## Complete Payment Flow with Mezo Passport

### 1. User Connects Bitcoin Wallet
```typescript
<ConnectButton />
// User selects Unisat, OKX, or Xverse
// Mezo Passport creates backing smart account on Matsnet
```

### 2. User Buys MUSD with Fiat
```typescript
<OnrampWidget 
  walletAddress={matsnetAddress} // Smart account receives MUSD
  sourceAmount="100"
/>
// Stripe processes payment
// MUSD minted to smart account
```

### 3. User Can Now Use MUSD
```typescript
// Check balance
const balance = useMUSDBalance();

// Send MUSD (signed with Bitcoin wallet)
await sendMUSD(recipientAddress, amount);

// User signs with their Bitcoin wallet
// Smart account executes the transaction
```

## Benefits for Our Integration

### 1. **Seamless UX** ✅
- Users only need their Bitcoin wallet
- No need to understand Matsnet or EVM
- Familiar Bitcoin wallet interface

### 2. **MUSD Compatibility** ✅
- MUSD is ERC-20 on Matsnet
- Smart account handles all EVM operations
- Bitcoin wallet provides security

### 3. **Stripe Integration** ✅
- Onramp sends MUSD to smart account
- User controls via Bitcoin wallet
- Perfect for non-crypto users

### 4. **Multi-Chain Ready** ✅
- Bitcoin operations via Bitcoin wallet
- MUSD operations via smart account
- Future: Cross-chain capabilities

## Environment Variables

Add to `dapp/.env`:

```env
# Mezo Passport
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here

# MUSD Token
VITE_MUSD_TOKEN_ADDRESS=0x...
VITE_MUSD_NETWORK=matsnet
VITE_MUSD_CHAIN_ID=1234

# Payment Service
VITE_PAYMENT_SERVICE_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Testing

### 1. Connect Bitcoin Wallet
- Use Unisat, OKX, or Xverse wallet
- Verify smart account is created
- Check both Bitcoin and Matsnet addresses

### 2. Buy MUSD
- Use Stripe Onramp
- Send to smart account address
- Verify MUSD balance

### 3. Send MUSD
- Sign transaction with Bitcoin wallet
- Verify execution via smart account
- Check recipient balance

## Next Steps

1. **Install Mezo Passport** in dapp
2. **Configure providers** and wrap app
3. **Update OnrampWidget** to use Matsnet address
4. **Add MUSD balance display**
5. **Implement send MUSD functionality**
6. **Test complete flow**

## Resources

- Mezo Passport Docs: https://www.npmjs.com/package/@mezo-org/passport
- RainbowKit Docs: https://www.rainbowkit.com/
- Wagmi Docs: https://wagmi.sh/
- Mezo Network: https://mezo.org

## Summary

**Mezo Passport is the missing piece** that connects:
- ✅ Bitcoin wallets (user's existing wallet)
- ✅ Matsnet (where MUSD lives)
- ✅ Stripe Onramp (fiat-to-crypto)
- ✅ Smart accounts (seamless execution)

Without it, users would need separate wallets for Bitcoin and MUSD. With it, they use one Bitcoin wallet for everything, and Mezo Passport handles the complexity behind the scenes.
