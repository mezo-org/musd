# Boar Network Deployment Guide - MUSD Payment Integration

## Overview

This guide covers deploying the MUSD Payment Integration using Boar Network's premium blockchain infrastructure for Mezo network connectivity.

**Boar Network**: https://boar.network/

## Why Boar Network?

Boar Network provides personalized premium blockchain infrastructure trusted globally:

- ✅ **Personalized Premium Service** - White-glove treatment, tailored solutions
- ✅ **Deep Expertise** - Protocol development contributors, governance participants
- ✅ **Uncompromising Standards** - Multi-region redundancy, real-time failover
- ✅ **Global Infrastructure** - Data centers across Europe, Americas, and Asia
- ✅ **Proven Track Record** - Operating since 2020, trusted by projects and funds worldwide
- ✅ **RPC + WebSocket Support** - Both HTTP and WSS endpoints available
- ✅ **Blockchain Native** - Built by blockchain veterans for blockchain projects

## Architecture with Boar Network

```
┌─────────────────────────────────────────────────────────┐
│                    User (Browser)                        │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  MUSD dApp       │         │  Bitcoin Wallet  │     │
│  │  (React)         │         │  (Mezo Passport) │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────┬──────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────────────────────────────────────────────┐
│              Frontend Services                           │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Vercel/Netlify  │         │  WalletConnect   │     │
│  │  (Static Host)   │         │  Cloud           │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Backend Services                            │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Payment Service │         │  Stripe API      │     │
│  │  (Node.js)       │         │                  │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Boar Network Infrastructure                 │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Mezo RPC        │         │  Mezo WebSocket  │     │
│  │  (HTTP)          │         │  (WSS)           │     │
│  │  - Multi-region  │         │  - Real-time     │     │
│  │  - Redundant     │         │  - Event streams │     │
│  │  - Load balanced │         │  - Block updates │     │
│  └──────────────────┘         └──────────────────┘     │
│                                                          │
│  Global Data Centers: Europe, Americas, Asia            │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Mezo Network                                │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  MUSD Token      │         │  Smart Accounts  │     │
│  │  Contract        │         │  (Matsnet)       │     │
│  └──────────────────┘         └──────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

Before deploying, ensure you have:

- [ ] Boar Network account and API key
- [ ] Boar Network RPC endpoint URL
- [ ] Boar Network WebSocket (WSS) endpoint URL
- [ ] Vercel account (for frontend)
- [ ] Railway or Heroku account (for backend)
- [ ] WalletConnect Project ID
- [ ] Stripe API keys
- [ ] MUSD token deployed to Mezo network

## Step 1: Boar Network Setup

### 1.1 Get Your Boar Network Credentials

You should have received from Boar Network:

```bash
# RPC Endpoint (HTTP)
https://mezo-rpc.boar.network/v1/YOUR_API_KEY

# WebSocket Endpoint (WSS)
wss://mezo-wss.boar.network/v1/YOUR_API_KEY

# API Key
YOUR_API_KEY
```

**Note:** Replace `YOUR_API_KEY` with your actual API key from Boar Network.

### 1.2 Verify Connectivity

Test your Boar Network RPC endpoint:

```bash
# Test RPC connectivity
curl -X POST https://mezo-rpc.boar.network/v1/YOUR_API_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": 1
  }'

# Expected response:
# {"jsonrpc":"2.0","id":1,"result":"0x..."}
```

Test WebSocket connectivity (optional, for advanced features):

```bash
# Using wscat (install: npm install -g wscat)
wscat -c wss://mezo-wss.boar.network/v1/YOUR_API_KEY

# Send test message:
{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}
```

## Step 2: Configure Environment Variables

### 2.1 Update dapp/.env

```bash
# Boar Network RPC Configuration
VITE_MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
VITE_MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet

# Boar Network API Key (for monitoring/analytics)
VITE_BOAR_API_KEY=YOUR_API_KEY

# WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# MUSD Token
VITE_MUSD_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000

# Payment Service
VITE_PAYMENT_SERVICE_URL=https://your-payment-service.railway.app

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
```

### 2.2 Update payment-service/.env

```bash
# Boar Network RPC Configuration
MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
MEZO_CHAIN_ID=1234
MEZO_NETWORK=testnet

# Boar Network API Key
BOAR_API_KEY=YOUR_API_KEY

# MUSD Token
MUSD_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_key

# Server
PORT=3001
NODE_ENV=production
```

## Step 3: Update Mezo Passport Configuration

Update `dapp/src/config/mezoPassport.ts` to use Boar Network RPC:

```typescript
import { getConfig } from "@mezo-org/passport"

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ""
const mezoRpcUrl = import.meta.env.VITE_MEZO_RPC_URL || ""
const mezoWssUrl = import.meta.env.VITE_MEZO_WSS_URL || ""

if (!projectId) {
  console.warn("WalletConnect Project ID not found")
}

if (!mezoRpcUrl) {
  console.warn("Mezo RPC URL not configured")
}

export const config = getConfig({
  appName: "MUSD - Mezo USD Payment Integration",
  walletConnectProjectId: projectId,
  mezoNetwork: "testnet", // or "mainnet"
  
  // Custom RPC configuration using Boar Network
  chains: [
    {
      id: parseInt(import.meta.env.VITE_MEZO_CHAIN_ID || "1234"),
      name: "Mezo Testnet",
      network: "mezo-testnet",
      nativeCurrency: {
        decimals: 18,
        name: "Mezo",
        symbol: "MEZO",
      },
      rpcUrls: {
        default: {
          http: [mezoRpcUrl],
          webSocket: mezoWssUrl ? [mezoWssUrl] : undefined,
        },
        public: {
          http: [mezoRpcUrl],
          webSocket: mezoWssUrl ? [mezoWssUrl] : undefined,
        },
      },
      blockExplorers: {
        default: {
          name: "Mezo Explorer",
          url: "https://explorer.mezo.org",
        },
      },
    },
  ],
})
```

## Step 4: Deploy Frontend (dApp)

### Option A: Vercel Deployment (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Build the dApp**
   ```bash
   cd dapp
   npm run build
   ```

3. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

4. **Configure Environment Variables in Vercel**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all variables from `dapp/.env` including Boar Network endpoints
   - Redeploy

### Option B: Netlify Deployment

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Build the dApp**
   ```bash
   cd dapp
   npm run build
   ```

3. **Deploy to Netlify**
   ```bash
   netlify deploy --prod --dir=dist
   ```

4. **Configure Environment Variables in Netlify**
   - Go to Netlify Dashboard → Your Site → Site settings → Environment variables
   - Add all variables from `dapp/.env`
   - Redeploy

## Step 5: Deploy Backend (Payment Service)

### Option A: Railway Deployment (Recommended)

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Initialize Railway Project**
   ```bash
   cd payment-service
   railway init
   ```

3. **Add PostgreSQL Database**
   ```bash
   railway add --database postgresql
   ```

4. **Add Environment Variables**
   ```bash
   railway variables set MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
   railway variables set MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
   railway variables set BOAR_API_KEY=YOUR_API_KEY
   railway variables set STRIPE_SECRET_KEY=sk_test_your_key
   railway variables set STRIPE_PUBLISHABLE_KEY=pk_test_your_key
   railway variables set MUSD_TOKEN_ADDRESS=0xYourTokenAddress
   railway variables set JWT_SECRET=$(openssl rand -base64 32)
   railway variables set CORS_ORIGIN=https://your-app.vercel.app
   ```

5. **Deploy**
   ```bash
   railway up
   ```

### Option B: Heroku Deployment

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Create Heroku App**
   ```bash
   cd payment-service
   heroku create musd-payment-service
   ```

3. **Add PostgreSQL**
   ```bash
   heroku addons:create heroku-postgresql:mini
   ```

4. **Add Environment Variables**
   ```bash
   heroku config:set MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
   heroku config:set MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
   heroku config:set BOAR_API_KEY=YOUR_API_KEY
   heroku config:set STRIPE_SECRET_KEY=sk_test_your_key
   heroku config:set STRIPE_PUBLISHABLE_KEY=pk_test_your_key
   heroku config:set MUSD_TOKEN_ADDRESS=0xYourTokenAddress
   heroku config:set JWT_SECRET=$(openssl rand -base64 32)
   heroku config:set CORS_ORIGIN=https://your-app.vercel.app
   ```

5. **Deploy**
   ```bash
   git push heroku main
   ```

## Step 6: Test the Deployment

### 6.1 Smoke Tests

```bash
# Test Boar Network RPC connectivity
curl -X POST https://mezo-rpc.boar.network/v1/YOUR_API_KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Test dApp
curl https://your-app.vercel.app

# Test payment service
curl https://your-payment-service.railway.app/health
```

### 6.2 Integration Tests

1. **Connect Wallet**
   - Open dApp in browser
   - Click "Connect Wallet"
   - Connect Bitcoin wallet (Unisat, OKX, or Xverse)
   - Verify wallet connection

2. **Check MUSD Balance**
   - Verify balance loads correctly
   - Check browser console for RPC calls to Boar Network

3. **Test Buy MUSD Flow**
   - Click "Buy MUSD with Card"
   - Complete Stripe test payment
   - Verify transaction

4. **Monitor Performance**
   - Check response times (should be fast with Boar Network)
   - Verify no errors in console
   - Test from different geographic locations

## Step 7: Advanced Features (Optional)

### 7.1 WebSocket Integration

For real-time updates, you can integrate Boar Network's WebSocket endpoint:

Create `dapp/src/hooks/useBlockUpdates.ts`:

```typescript
import { useEffect, useState } from 'react';

export function useBlockUpdates() {
  const [blockNumber, setBlockNumber] = useState<number | null>(null);
  const wssUrl = import.meta.env.VITE_MEZO_WSS_URL;

  useEffect(() => {
    if (!wssUrl) return;

    const ws = new WebSocket(wssUrl);

    ws.onopen = () => {
      console.log('Connected to Boar Network WebSocket');
      
      // Subscribe to new blocks
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_subscribe',
        params: ['newHeads'],
        id: 1,
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.params?.result?.number) {
        const blockNum = parseInt(data.params.result.number, 16);
        setBlockNumber(blockNum);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Disconnected from Boar Network WebSocket');
    };

    return () => {
      ws.close();
    };
  }, [wssUrl]);

  return blockNumber;
}
```

Use in your component:

```typescript
import { useBlockUpdates } from './hooks/useBlockUpdates';

function App() {
  const blockNumber = useBlockUpdates();

  return (
    <div>
      {blockNumber && <p>Latest Block: {blockNumber}</p>}
      {/* Rest of your app */}
    </div>
  );
}
```

### 7.2 Connection Monitoring

Create `dapp/src/utils/boarMonitoring.ts`:

```typescript
export async function checkBoarNetworkHealth(rpcUrl: string): Promise<{
  healthy: boolean;
  latency: number;
  blockNumber: number | null;
}> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const data = await response.json();
    const latency = Date.now() - startTime;
    const blockNumber = data.result ? parseInt(data.result, 16) : null;

    return {
      healthy: response.ok && blockNumber !== null,
      latency,
      blockNumber,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - startTime,
      blockNumber: null,
    };
  }
}
```

## Step 8: Production Checklist

### Before Going Live

- [ ] Switch to Mezo Mainnet RPC from Boar Network
- [ ] Update all environment variables to production values
- [ ] Switch Stripe to live mode (remove `_test_` keys)
- [ ] Deploy MUSD token to Mezo Mainnet
- [ ] Update `VITE_MUSD_TOKEN_ADDRESS` with mainnet address
- [ ] Configure production domain in WalletConnect
- [ ] Set up SSL certificates (automatic with Vercel)
- [ ] Configure CORS for production domains
- [ ] Set up error tracking (Sentry, Rollbar)
- [ ] Configure log aggregation (Datadog, LogRocket)
- [ ] Set up uptime monitoring (Pingdom, UptimeRobot)
- [ ] Perform security audit
- [ ] Load testing with Boar Network endpoints
- [ ] Backup and disaster recovery plan

### Boar Network Production Configuration

```bash
# Production RPC Endpoints (update with your actual mainnet endpoints)
VITE_MEZO_RPC_URL=https://mezo-mainnet-rpc.boar.network/v1/YOUR_PROD_API_KEY
VITE_MEZO_WSS_URL=wss://mezo-mainnet-wss.boar.network/v1/YOUR_PROD_API_KEY
MEZO_RPC_URL=https://mezo-mainnet-rpc.boar.network/v1/YOUR_PROD_API_KEY
MEZO_WSS_URL=wss://mezo-mainnet-wss.boar.network/v1/YOUR_PROD_API_KEY

# Update network to mainnet
VITE_MEZO_NETWORK=mainnet
MEZO_NETWORK=mainnet
```

## Step 9: Monitoring and Maintenance

### Daily Monitoring

1. **Boar Network Performance**
   - Monitor RPC response times
   - Check for any connectivity issues
   - Verify WebSocket connections are stable

2. **Application Metrics**
   - User connections
   - Transaction volume
   - Error rates
   - Response times

3. **Stripe Dashboard**
   - Payment success rate
   - Refund rate
   - Dispute rate

### Weekly Tasks

- Review Boar Network performance trends
- Analyze transaction patterns
- Check for security alerts
- Review error logs
- Update dependencies

### Monthly Tasks

- Review infrastructure costs
- Optimize RPC calls
- Performance tuning
- Security updates
- Backup verification

## Boar Network Benefits

### Performance

- **Multi-Region Infrastructure**: Data centers across Europe, Americas, and Asia
- **Low Latency**: Optimized routing for fastest response times
- **High Availability**: Real-time failover and redundancy
- **Load Balancing**: Automatic distribution across multiple nodes

### Reliability

- **Proven Track Record**: Operating since 2020
- **Uncompromising Standards**: Multi-region redundancy as minimum standard
- **Expert Team**: Protocol development contributors
- **24/7 Monitoring**: Continuous infrastructure monitoring

### Support

- **Personalized Service**: White-glove treatment for all customers
- **Deep Expertise**: Blockchain protocol specialists
- **Tailored Solutions**: Custom infrastructure for specific needs
- **Long-term Partnership**: Trusted by projects and funds worldwide

## Cost Estimation

### Boar Network Pricing

Contact Boar Network for personalized pricing based on your needs:
- **Website**: https://boar.network/
- **Pricing**: Custom quotes based on usage and requirements
- **Typical Range**: Premium service with enterprise-grade infrastructure

### Total Monthly Cost (with Boar Network)

**Development/Testing:**
- Vercel: Free
- Railway: $5/month
- Stripe: Free (test mode)
- Boar Network: Contact for pricing
- **Total**: $5/month + Boar Network fees

**Production:**
- Vercel Pro: $20/month
- Railway: $20-50/month
- Stripe: 2.9% + $0.30 per transaction
- Boar Network: Contact for pricing
- **Total**: $40-70/month + Boar Network fees + transaction fees

## Troubleshooting

### Common Issues

**Issue**: RPC calls failing
- **Solution**: Verify Boar Network API key is correct
- **Solution**: Check endpoint URLs are properly configured
- **Solution**: Test connectivity with curl command

**Issue**: High latency
- **Solution**: Verify you're using the closest Boar Network data center
- **Solution**: Check network connectivity
- **Solution**: Contact Boar Network support for optimization

**Issue**: WebSocket connection drops
- **Solution**: Implement reconnection logic
- **Solution**: Check firewall settings
- **Solution**: Verify WSS endpoint URL is correct

**Issue**: Wallet connection fails
- **Solution**: Verify WalletConnect Project ID
- **Solution**: Check Mezo RPC URL is accessible
- **Solution**: Verify chain ID matches network

## Support

### Boar Network Support

- **Website**: https://boar.network/
- **Contact**: Reach out through their website for personalized support
- **Service**: White-glove treatment with deep technical expertise

### MUSD Support

- **Documentation**: See `docs/` folder
- **Troubleshooting**: See `TROUBLESHOOTING.md`
- **API Keys Setup**: See `API_KEYS_SETUP.md`

## Comparison: Boar Network vs Other Options

| Feature | Boar Network | Spectrum Nodes | Public RPC |
|---------|--------------|----------------|------------|
| **Service Level** | Premium, Personalized | Enterprise | Basic |
| **Infrastructure** | Multi-region, Global | Multi-region | Single region |
| **Support** | White-glove | Priority | Community |
| **Expertise** | Protocol contributors | Blockchain specialists | N/A |
| **Customization** | Fully tailored | Standard plans | None |
| **WebSocket** | ✅ Yes | ✅ Yes | ❌ Limited |
| **Redundancy** | Multi-region | Multi-region | ❌ No |
| **Best For** | Premium projects | High-traffic apps | Development |

## Next Steps

1. ✅ Configure Boar Network endpoints
2. ✅ Deploy frontend to Vercel/Netlify
3. ✅ Deploy backend to Railway/Heroku
4. ✅ Test complete flow
5. ✅ Monitor performance
6. ✅ Optimize and scale

---

**Status**: Ready for Boar Network Deployment  
**Last Updated**: November 2, 2025  
**Version**: 1.0.0

**Contact Boar Network**: https://boar.network/ for personalized infrastructure solutions
