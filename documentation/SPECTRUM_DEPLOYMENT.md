# Spectrum Nodes Deployment Guide

## Overview

This guide covers deploying the MUSD Payment Integration dApp using Spectrum Nodes RPC infrastructure for Mezo network connectivity.

**Spectrum Nodes**: https://spectrumnodes.com/

## Why Spectrum Nodes?

Spectrum provides reliable, scalable RPC and API infrastructure for 170+ blockchain networks including Mezo:

- ✅ High-performance RPC endpoints
- ✅ Real-time metrics and monitoring
- ✅ Multi-region fallover
- ✅ Private infrastructure
- ✅ 99.9% uptime SLA
- ✅ Dedicated support

## Architecture with Spectrum

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
│              Spectrum Nodes RPC                          │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Mezo Mainnet    │         │  Mezo Testnet    │     │
│  │  RPC Endpoint    │         │  RPC Endpoint    │     │
│  │  (Private)       │         │  (Private)       │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────────────────────┘
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

## Step 1: Sign Up for Spectrum Nodes

### 1.1 Create Account

1. Visit https://spectrumnodes.com/
2. Click "Sign Up" or "Get Started"
3. Choose a plan:
   - **Free**: 25M credits/month, 3 networks, 20 RPS
   - **Developer**: $35/month, 100M credits, 5 networks, 50 RPS
   - **Business**: $169/month, 750M credits, All networks, 200 RPS
   - **Enterprise**: $459/month, 3B credits, All networks, 300 RPS

**Recommendation**: Start with **Developer** plan for testing, upgrade to **Business** for production.

### 1.2 Add Mezo Network

1. Log in to Spectrum Dashboard
2. Navigate to "Networks" or "Add Network"
3. Search for "Mezo"
4. Select:
   - **Mezo Mainnet** (for production)
   - **Mezo Testnet** (for development)
5. Click "Add Network"

### 1.3 Get RPC Endpoints

Once Mezo is added, you'll receive:

```bash
# Mezo Mainnet
https://mezo-mainnet.spectrumnodes.com/v1/YOUR_API_KEY

# Mezo Testnet  
https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
```

**Note**: Replace `YOUR_API_KEY` with your actual API key from the dashboard.

## Step 2: Configure Environment Variables

### 2.1 Update dapp/.env

```bash
# Spectrum RPC Configuration
VITE_MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet

# WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# MUSD Token
VITE_MUSD_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000

# Payment Service
VITE_PAYMENT_SERVICE_URL=https://your-payment-service.com

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
```

### 2.2 Update payment-service/.env

```bash
# Spectrum RPC Configuration
MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
MEZO_CHAIN_ID=1234
MEZO_NETWORK=testnet

# Spectrum API Key (for monitoring)
SPECTRUM_API_KEY=YOUR_API_KEY

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

Update `dapp/src/config/mezoPassport.ts` to use Spectrum RPC:

```typescript
import { getConfig } from "@mezo-org/passport"

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ""
const mezoRpcUrl = import.meta.env.VITE_MEZO_RPC_URL || ""

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
  
  // Custom RPC configuration using Spectrum
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
        },
        public: {
          http: [mezoRpcUrl],
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

### Option A: Vercel Deployment

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
   - Add all variables from `dapp/.env`
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

### Option C: AWS S3 + CloudFront

1. **Build the dApp**
   ```bash
   cd dapp
   npm run build
   ```

2. **Upload to S3**
   ```bash
   aws s3 sync dist/ s3://your-bucket-name --delete
   ```

3. **Configure CloudFront**
   - Create CloudFront distribution
   - Point to S3 bucket
   - Configure SSL certificate
   - Set environment variables via Lambda@Edge

## Step 5: Deploy Backend (Payment Service)

### Option A: Railway Deployment

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Initialize Railway Project**
   ```bash
   cd payment-service
   railway init
   ```

3. **Add Environment Variables**
   ```bash
   railway variables set MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
   railway variables set STRIPE_SECRET_KEY=sk_test_your_key
   # ... add all other variables
   ```

4. **Deploy**
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

3. **Add Environment Variables**
   ```bash
   heroku config:set MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
   heroku config:set STRIPE_SECRET_KEY=sk_test_your_key
   # ... add all other variables
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

### Option C: AWS ECS/Fargate

1. **Build Docker Image**
   ```bash
   cd payment-service
   docker build -t musd-payment-service .
   ```

2. **Push to ECR**
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ECR_URL
   docker tag musd-payment-service:latest YOUR_ECR_URL/musd-payment-service:latest
   docker push YOUR_ECR_URL/musd-payment-service:latest
   ```

3. **Create ECS Task Definition**
   - Configure environment variables
   - Set Spectrum RPC URL
   - Configure health checks

4. **Deploy to ECS**
   ```bash
   aws ecs update-service --cluster your-cluster --service musd-payment-service --force-new-deployment
   ```

## Step 6: Configure Spectrum Monitoring

### 6.1 Enable Monitoring

1. Log in to Spectrum Dashboard
2. Navigate to "Monitoring" or "Analytics"
3. Enable real-time metrics for Mezo network

### 6.2 Set Up Alerts

Configure alerts for:
- **High RPS Usage**: Alert when approaching rate limits
- **Error Rate**: Alert when error rate > 5%
- **Latency**: Alert when response time > 2s
- **Credit Usage**: Alert when 80% of monthly credits used

### 6.3 Monitor Key Metrics

Track these metrics in Spectrum Dashboard:
- **Requests per second (RPS)**
- **Total requests**
- **Error rate**
- **Average latency**
- **Credit usage**
- **Method distribution** (eth_call, eth_sendTransaction, etc.)

## Step 7: Test the Deployment

### 7.1 Smoke Tests

```bash
# Test RPC connectivity
curl -X POST https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Test dApp
curl https://your-dapp-url.com

# Test payment service
curl https://your-payment-service.com/health
```

### 7.2 Integration Tests

1. **Connect Wallet**
   - Open dApp in browser
   - Click "Connect Wallet"
   - Connect Bitcoin wallet (Unisat, OKX, or Xverse)
   - Verify wallet connection

2. **Check MUSD Balance**
   - Verify balance loads correctly
   - Check Spectrum dashboard for RPC calls

3. **Test Buy MUSD Flow**
   - Click "Buy MUSD with Card"
   - Complete Stripe test payment
   - Verify transaction in Spectrum dashboard

4. **Monitor Spectrum Metrics**
   - Check RPS usage
   - Verify no errors
   - Monitor latency

## Step 8: Production Checklist

### Before Going Live

- [ ] Switch to Mezo Mainnet RPC
- [ ] Update all environment variables to production values
- [ ] Switch Stripe to live mode (remove `_test_` keys)
- [ ] Deploy MUSD token to Mezo Mainnet
- [ ] Update `VITE_MUSD_TOKEN_ADDRESS` with mainnet address
- [ ] Configure production domain in WalletConnect
- [ ] Set up SSL certificates
- [ ] Configure CORS for production domains
- [ ] Enable Spectrum production monitoring
- [ ] Set up error tracking (Sentry, Rollbar)
- [ ] Configure log aggregation (Datadog, LogRocket)
- [ ] Set up uptime monitoring (Pingdom, UptimeRobot)
- [ ] Perform security audit
- [ ] Load testing
- [ ] Backup and disaster recovery plan

### Spectrum Production Configuration

```bash
# Production RPC Endpoints
VITE_MEZO_RPC_URL=https://mezo-mainnet.spectrumnodes.com/v1/YOUR_PROD_API_KEY
MEZO_RPC_URL=https://mezo-mainnet.spectrumnodes.com/v1/YOUR_PROD_API_KEY

# Upgrade to Business or Enterprise plan for production
# - Higher RPS limits
# - More credits
# - Priority support
# - Multi-region fallover
```

## Step 9: Monitoring and Maintenance

### Daily Monitoring

1. **Spectrum Dashboard**
   - Check RPS usage
   - Monitor error rates
   - Review latency metrics
   - Track credit consumption

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

- Review Spectrum usage trends
- Analyze transaction patterns
- Check for security alerts
- Review error logs
- Update dependencies

### Monthly Tasks

- Review Spectrum plan usage
- Optimize RPC calls
- Performance tuning
- Security updates
- Backup verification

## Cost Estimation

### Spectrum Nodes Costs

**Development (Testnet)**
- Plan: Developer ($35/month)
- Credits: 100M/month
- RPS: 50
- Estimated usage: 20M credits/month
- **Cost**: $35/month

**Production (Mainnet)**
- Plan: Business ($169/month)
- Credits: 750M/month
- RPS: 200
- Estimated usage: 200M credits/month
- **Cost**: $169/month

### Additional Costs

- **Frontend Hosting**: $0-20/month (Vercel/Netlify free tier)
- **Backend Hosting**: $25-100/month (Railway/Heroku)
- **Database**: $15-50/month (PostgreSQL)
- **Stripe Fees**: 2.9% + $0.30 per transaction
- **Domain**: $12/year
- **SSL Certificate**: Free (Let's Encrypt)
- **Monitoring**: $0-50/month (Sentry free tier)

**Total Estimated Monthly Cost**: $250-400/month

## Troubleshooting

### Common Issues

**Issue**: RPC calls failing
- **Solution**: Check Spectrum API key is correct
- **Solution**: Verify network is added in Spectrum dashboard
- **Solution**: Check credit balance

**Issue**: High latency
- **Solution**: Upgrade Spectrum plan for better performance
- **Solution**: Enable multi-region fallover
- **Solution**: Optimize RPC call frequency

**Issue**: Rate limit exceeded
- **Solution**: Upgrade Spectrum plan for higher RPS
- **Solution**: Implement request caching
- **Solution**: Batch RPC calls where possible

**Issue**: Wallet connection fails
- **Solution**: Verify WalletConnect Project ID
- **Solution**: Check Mezo RPC URL is accessible
- **Solution**: Verify chain ID matches network

## Support

### Spectrum Support

- **Dashboard**: https://spectrumnodes.com/dashboard
- **Documentation**: https://docs.spectrumnodes.com/
- **Support Email**: support@spectrumnodes.com
- **Discord**: https://discord.gg/spectrumnodes

### MUSD Support

- **Documentation**: See `docs/` folder
- **Troubleshooting**: See `TROUBLESHOOTING.md`
- **API Keys Setup**: See `API_KEYS_SETUP.md`

## Next Steps

1. ✅ Sign up for Spectrum Nodes
2. ✅ Configure RPC endpoints
3. ✅ Deploy frontend to Vercel/Netlify
4. ✅ Deploy backend to Railway/Heroku
5. ✅ Test complete flow
6. ✅ Monitor Spectrum metrics
7. ✅ Optimize and scale

---

**Status**: Ready for Spectrum Deployment
**Last Updated**: November 2, 2025
**Version**: 1.0.0
