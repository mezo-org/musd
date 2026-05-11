# Vercel Deployment Guide - MUSD Payment Integration

## Overview

This guide covers deploying the MUSD Payment Integration to Vercel (frontend) and Railway/Heroku (backend). This is the recommended deployment approach for quick setup and scalability.

## Architecture

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
│              Vercel (Frontend)                           │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Static Assets   │         │  WalletConnect   │     │
│  │  (React Build)   │         │  Cloud           │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│         Railway/Heroku (Backend)                         │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Payment Service │         │  PostgreSQL      │     │
│  │  (Node.js)       │         │  Database        │     │
│  └──────────────────┘         └──────────────────┘     │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              External Services                           │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Stripe API      │         │  Mezo Network    │     │
│  │  (Payments)      │         │  (RPC)           │     │
│  └──────────────────┘         └──────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

Before deploying, ensure you have:

- [ ] GitHub account
- [ ] Vercel account (free tier works)
- [ ] Railway or Heroku account
- [ ] WalletConnect Project ID
- [ ] Stripe API keys (test mode for staging)
- [ ] MUSD token deployed to Mezo network

## Part 1: Backend Deployment (Payment Service)

### Option A: Railway (Recommended)

#### 1.1 Install Railway CLI

```bash
npm install -g @railway/cli
```

#### 1.2 Login to Railway

```bash
railway login
```

#### 1.3 Initialize Project

```bash
cd payment-service
railway init
```

Select "Create new project" and give it a name like "musd-payment-service".

#### 1.4 Add PostgreSQL Database

```bash
railway add --database postgresql
```

This will automatically create a PostgreSQL database and set the `DATABASE_URL` environment variable.

#### 1.5 Set Environment Variables

```bash
# Required variables
railway variables set NODE_ENV=production
railway variables set PORT=3001

# Stripe configuration
railway variables set STRIPE_SECRET_KEY=sk_test_your_key
railway variables set STRIPE_PUBLISHABLE_KEY=pk_test_your_key
railway variables set STRIPE_WEBHOOK_SECRET=whsec_your_secret

# MUSD configuration
railway variables set MUSD_TOKEN_ADDRESS=0xYourTokenAddress

# Mezo RPC (choose one option below)
# Option 1: Public RPC
railway variables set MEZO_RPC_URL=https://testnet-rpc.mezo.org
railway variables set MEZO_CHAIN_ID=1234
railway variables set MEZO_NETWORK=testnet

# Option 2: Spectrum Nodes (see SPECTRUM_DEPLOYMENT.md)
# railway variables set MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
# railway variables set SPECTRUM_API_KEY=YOUR_API_KEY

# Security
railway variables set JWT_SECRET=$(openssl rand -base64 32)

# CORS - will update after Vercel deployment
railway variables set CORS_ORIGIN=https://your-app.vercel.app
```

#### 1.6 Deploy to Railway

```bash
railway up
```

Railway will:
1. Build your application
2. Run database migrations
3. Deploy to production
4. Provide you with a URL

#### 1.7 Get Your Backend URL

```bash
railway domain
```

Save this URL - you'll need it for the frontend configuration.

Example: `https://musd-payment-service-production.up.railway.app`

#### 1.8 Configure Stripe Webhooks

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Enter your Railway URL + `/api/v1/webhooks/stripe`:
   ```
   https://musd-payment-service-production.up.railway.app/api/v1/webhooks/stripe
   ```
4. Select events to listen for:
   - `crypto_onramp_session.completed`
   - `crypto_onramp_session.failed`
   - `crypto_onramp_session.updated`
5. Copy the webhook signing secret
6. Update Railway environment variable:
   ```bash
   railway variables set STRIPE_WEBHOOK_SECRET=whsec_your_new_secret
   ```

### Option B: Heroku

#### 1.1 Install Heroku CLI

```bash
npm install -g heroku
```

#### 1.2 Login to Heroku

```bash
heroku login
```

#### 1.3 Create Heroku App

```bash
cd payment-service
heroku create musd-payment-service
```

#### 1.4 Add PostgreSQL

```bash
heroku addons:create heroku-postgresql:mini
```

#### 1.5 Set Environment Variables

```bash
# Required variables
heroku config:set NODE_ENV=production
heroku config:set PORT=3001

# Stripe configuration
heroku config:set STRIPE_SECRET_KEY=sk_test_your_key
heroku config:set STRIPE_PUBLISHABLE_KEY=pk_test_your_key
heroku config:set STRIPE_WEBHOOK_SECRET=whsec_your_secret

# MUSD configuration
heroku config:set MUSD_TOKEN_ADDRESS=0xYourTokenAddress

# Mezo RPC
heroku config:set MEZO_RPC_URL=https://testnet-rpc.mezo.org
heroku config:set MEZO_CHAIN_ID=1234
heroku config:set MEZO_NETWORK=testnet

# Security
heroku config:set JWT_SECRET=$(openssl rand -base64 32)

# CORS
heroku config:set CORS_ORIGIN=https://your-app.vercel.app
```

#### 1.6 Deploy to Heroku

```bash
git push heroku main
```

#### 1.7 Get Your Backend URL

```bash
heroku info
```

Look for "Web URL" - save this for frontend configuration.

## Part 2: Frontend Deployment (dApp)

### 2.1 Prepare for Vercel

#### Update package.json

Ensure your `dapp/package.json` has the build script:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

#### Create vercel.json

Create `dapp/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 2.2 Deploy to Vercel

#### Option A: Vercel CLI (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy from dapp directory**
   ```bash
   cd dapp
   vercel
   ```

4. **Follow the prompts:**
   - Set up and deploy? `Y`
   - Which scope? Select your account
   - Link to existing project? `N`
   - What's your project's name? `musd-dapp`
   - In which directory is your code located? `./`
   - Want to override the settings? `N`

5. **Deploy to production**
   ```bash
   vercel --prod
   ```

#### Option B: Vercel GitHub Integration

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to https://vercel.com/new
   - Click "Import Git Repository"
   - Select your repository
   - Configure project:
     - Framework Preset: Vite
     - Root Directory: `dapp`
     - Build Command: `npm run build`
     - Output Directory: `dist`

3. **Click "Deploy"**

### 2.3 Configure Environment Variables in Vercel

#### Via Vercel Dashboard

1. Go to your project in Vercel Dashboard
2. Click "Settings" → "Environment Variables"
3. Add the following variables:

```bash
# WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# MUSD Token
VITE_MUSD_TOKEN_ADDRESS=0xYourTokenAddress

# Payment Service (use your Railway/Heroku URL)
VITE_PAYMENT_SERVICE_URL=https://musd-payment-service-production.up.railway.app

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key

# Mezo Network (choose one option)
# Option 1: Public RPC
VITE_MEZO_RPC_URL=https://testnet-rpc.mezo.org
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet

# Option 2: Spectrum Nodes (see SPECTRUM_DEPLOYMENT.md)
# VITE_MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
```

4. Click "Save"
5. Redeploy: Go to "Deployments" → Click "..." on latest deployment → "Redeploy"

#### Via Vercel CLI

```bash
cd dapp

# Set environment variables
vercel env add VITE_WALLETCONNECT_PROJECT_ID
# Enter value when prompted

vercel env add VITE_MUSD_TOKEN_ADDRESS
vercel env add VITE_PAYMENT_SERVICE_URL
vercel env add VITE_STRIPE_PUBLISHABLE_KEY
vercel env add VITE_MEZO_RPC_URL
vercel env add VITE_MEZO_CHAIN_ID
vercel env add VITE_MEZO_NETWORK

# Redeploy
vercel --prod
```

### 2.4 Update Backend CORS

Now that you have your Vercel URL, update the backend CORS configuration:

```bash
# Railway
railway variables set CORS_ORIGIN=https://your-app.vercel.app

# Heroku
heroku config:set CORS_ORIGIN=https://your-app.vercel.app
```

## Part 3: Get Required API Keys

### 3.1 WalletConnect Project ID

1. Go to https://cloud.walletconnect.com/
2. Sign up or log in
3. Click "Create New Project"
4. Enter project name: "MUSD Payment Integration"
5. Copy the Project ID
6. Add to Vercel environment variables

### 3.2 Stripe API Keys

1. Go to https://dashboard.stripe.com/
2. Sign up or log in
3. Switch to "Test mode" (toggle in top right)
4. Go to Developers → API keys
5. Copy:
   - Publishable key (starts with `pk_test_`)
   - Secret key (starts with `sk_test_`)
6. Add to both Vercel and Railway/Heroku

### 3.3 Stripe Crypto Onramp Access

**Important:** Stripe Crypto Onramp is currently in private beta.

1. Go to https://dashboard.stripe.com/
2. Navigate to "Crypto" section
3. Request access to Crypto Onramp
4. Wait for approval (can take a few days)

**Alternative for testing:**
- Use the mock implementation in the payment service
- The service will return simulated responses until Stripe Crypto is enabled

## Part 4: Testing the Deployment

### 4.1 Smoke Tests

```bash
# Test backend health
curl https://your-backend-url.railway.app/health

# Expected response:
# {"status":"ok","timestamp":"2025-11-02T..."}

# Test frontend
curl https://your-app.vercel.app

# Should return HTML
```

### 4.2 Integration Tests

1. **Open your Vercel URL in browser**
   ```
   https://your-app.vercel.app
   ```

2. **Check browser console** (F12)
   - Should see no errors
   - Should see "Mezo Passport initialized" or similar

3. **Connect Bitcoin wallet**
   - Click "Connect Wallet"
   - Select wallet (Unisat, OKX, or Xverse)
   - Approve connection
   - Verify wallet address appears

4. **Check MUSD balance**
   - Should load without errors
   - May show 0 if no MUSD yet

5. **Test Buy MUSD flow**
   - Click "Buy MUSD with Card"
   - Enter amount (e.g., $100)
   - Click "Continue"
   - Should see Stripe payment form or error message

### 4.3 Monitor Logs

**Vercel Logs:**
```bash
vercel logs
```

**Railway Logs:**
```bash
railway logs
```

**Heroku Logs:**
```bash
heroku logs --tail
```

## Part 5: Production Deployment

### 5.1 Switch to Mainnet

When ready for production:

1. **Deploy MUSD token to Mezo Mainnet**
2. **Get mainnet token address**
3. **Update environment variables:**

```bash
# Vercel
vercel env add VITE_MEZO_RPC_URL production
# Enter: https://mainnet-rpc.mezo.org (or Spectrum mainnet URL)

vercel env add VITE_MEZO_NETWORK production
# Enter: mainnet

vercel env add VITE_MUSD_TOKEN_ADDRESS production
# Enter: 0xYourMainnetTokenAddress

# Railway
railway variables set MEZO_RPC_URL=https://mainnet-rpc.mezo.org
railway variables set MEZO_NETWORK=mainnet
railway variables set MUSD_TOKEN_ADDRESS=0xYourMainnetTokenAddress
```

4. **Switch Stripe to live mode:**

```bash
# Get live keys from Stripe Dashboard (remove test mode toggle)
vercel env add VITE_STRIPE_PUBLISHABLE_KEY production
# Enter: pk_live_your_key

railway variables set STRIPE_SECRET_KEY=sk_live_your_key
railway variables set STRIPE_PUBLISHABLE_KEY=pk_live_your_key
```

5. **Update Stripe webhook to production URL**

6. **Redeploy both services:**

```bash
# Frontend
cd dapp
vercel --prod

# Backend
cd payment-service
railway up
```

### 5.2 Production Checklist

- [ ] MUSD token deployed to mainnet
- [ ] All environment variables updated to mainnet
- [ ] Stripe switched to live mode
- [ ] Webhook configured for production URL
- [ ] SSL certificates configured (automatic with Vercel)
- [ ] Custom domain configured (optional)
- [ ] Error tracking enabled (Sentry, etc.)
- [ ] Analytics configured (Google Analytics, etc.)
- [ ] Performance monitoring enabled
- [ ] Backup strategy in place
- [ ] Security audit completed
- [ ] Load testing completed

## Part 6: Custom Domain (Optional)

### 6.1 Configure Custom Domain in Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Click "Add Domain"
3. Enter your domain (e.g., `musd.yourdomain.com`)
4. Follow DNS configuration instructions
5. Wait for DNS propagation (can take up to 48 hours)

### 6.2 Update CORS

```bash
railway variables set CORS_ORIGIN=https://musd.yourdomain.com
```

## Part 7: Monitoring and Maintenance

### 7.1 Vercel Analytics

Vercel provides built-in analytics:
- Go to your project → Analytics
- View page views, performance metrics, etc.

### 7.2 Railway Metrics

Railway provides:
- CPU usage
- Memory usage
- Network traffic
- Deployment history

### 7.3 Set Up Alerts

**Vercel:**
- Go to Settings → Notifications
- Configure deployment notifications
- Set up error alerts

**Railway:**
- Configure health check alerts
- Set up deployment notifications

### 7.4 Error Tracking (Recommended)

Install Sentry for error tracking:

```bash
cd dapp
npm install @sentry/react @sentry/vite-plugin

cd ../payment-service
npm install @sentry/node
```

Configure in your apps and deploy.

## Troubleshooting

### Issue: Build fails on Vercel

**Solution:**
1. Check build logs in Vercel Dashboard
2. Ensure all dependencies are in `package.json`
3. Try building locally: `npm run build`
4. Check for TypeScript errors

### Issue: Environment variables not working

**Solution:**
1. Verify variables are set in Vercel Dashboard
2. Ensure variable names start with `VITE_` for frontend
3. Redeploy after adding variables
4. Check browser console for undefined values

### Issue: CORS errors

**Solution:**
1. Verify `CORS_ORIGIN` in backend matches Vercel URL exactly
2. Include protocol: `https://your-app.vercel.app`
3. No trailing slash
4. Redeploy backend after updating

### Issue: Stripe webhook not working

**Solution:**
1. Verify webhook URL is correct in Stripe Dashboard
2. Check webhook signing secret matches environment variable
3. Test webhook with Stripe CLI:
   ```bash
   stripe listen --forward-to https://your-backend-url/api/v1/webhooks/stripe
   ```

### Issue: Payment service crashes

**Solution:**
1. Check Railway/Heroku logs
2. Verify database connection
3. Ensure all required environment variables are set
4. Check for missing dependencies

## Cost Estimation

### Free Tier (Development/Testing)

- **Vercel**: Free (100GB bandwidth, unlimited deployments)
- **Railway**: $5/month (500 hours, 512MB RAM, 1GB disk)
- **Heroku**: $0 (Eco dynos, 1000 hours/month)
- **PostgreSQL**: Included with Railway/Heroku
- **Total**: $0-5/month

### Production

- **Vercel Pro**: $20/month (1TB bandwidth, advanced features)
- **Railway**: $20-50/month (depending on usage)
- **Heroku Standard**: $25-50/month
- **PostgreSQL**: $15-50/month (depending on size)
- **Stripe fees**: 2.9% + $0.30 per transaction
- **Total**: $80-150/month

## Alternative: Spectrum Nodes RPC

For better RPC performance and reliability, consider using Spectrum Nodes instead of public RPC:

See `SPECTRUM_DEPLOYMENT.md` for detailed instructions.

**Benefits:**
- 99.9% uptime SLA
- Higher rate limits
- Better performance
- Real-time monitoring
- Multi-region fallover

**Cost:** $35-169/month (depending on plan)

## Next Steps

1. ✅ Deploy backend to Railway/Heroku
2. ✅ Deploy frontend to Vercel
3. ✅ Configure all environment variables
4. ✅ Get API keys (WalletConnect, Stripe)
5. ✅ Test complete flow
6. ✅ Set up monitoring
7. ✅ Configure custom domain (optional)
8. ✅ Switch to production when ready

## Support

- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app/
- **Heroku Docs**: https://devcenter.heroku.com/
- **Stripe Docs**: https://stripe.com/docs
- **WalletConnect Docs**: https://docs.walletconnect.com/

---

**Status**: Ready for Deployment
**Last Updated**: November 2, 2025
**Version**: 1.0.0
