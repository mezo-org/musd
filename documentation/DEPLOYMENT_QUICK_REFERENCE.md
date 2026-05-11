# Deployment Quick Reference

## 🚀 Choose Your Deployment Path

### Path 1: Quick Start (Recommended for Most Users)
**Time:** 30-60 minutes  
**Cost:** $0-5/month (free tiers available)  
**Best for:** Development, testing, small-to-medium production apps
**RPC:** Public Mezo RPC (free)

```bash
# 1. Deploy Backend to Railway
cd payment-service
npm install -g @railway/cli
railway login
railway init
railway add --database postgresql
railway variables set STRIPE_SECRET_KEY=sk_test_your_key
railway variables set STRIPE_PUBLISHABLE_KEY=pk_test_your_key
railway variables set MUSD_TOKEN_ADDRESS=0xYourTokenAddress
railway variables set JWT_SECRET=$(openssl rand -base64 32)
railway up

# 2. Deploy Frontend to Vercel
cd ../dapp
npm install -g vercel
vercel login
vercel
# Configure environment variables in Vercel Dashboard
vercel --prod
```

**📖 Full Guide:** `VERCEL_DEPLOYMENT.md`

---

### Path 2: Premium Infrastructure (Boar Network)
**Time:** 30-60 minutes  
**Cost:** $5/month + Boar Network fees (custom pricing)  
**Best for:** Projects requiring personalized premium service, global infrastructure
**RPC:** Boar Network (premium, multi-region, WebSocket support)

```bash
# Deploy with Boar Network RPC
railway variables set MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
railway variables set MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY

# In Vercel Dashboard, add:
VITE_MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
VITE_MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
```

**📖 Full Guide:** `BOAR_DEPLOYMENT.md`

---

### Path 3: Enterprise (Spectrum Nodes)
**Time:** 1-2 hours  
**Cost:** $250-400/month  
**Best for:** High-traffic production, 99.9% SLA, advanced monitoring
**RPC:** Spectrum Nodes (enterprise, 170+ networks)

```bash
# 1. Sign up for Spectrum Nodes
# Visit: https://spectrumnodes.com/
# Choose Business plan ($169/month)

# 2. Deploy with Spectrum RPC
# Follow Path 1 above, but use Spectrum RPC URLs:
railway variables set MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
railway variables set SPECTRUM_API_KEY=YOUR_API_KEY

# In Vercel Dashboard, add:
VITE_MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
```

**📖 Full Guide:** `SPECTRUM_DEPLOYMENT.md`

---

## 📋 Pre-Deployment Checklist

### Required API Keys

| Service | Where to Get | Environment Variable | Required For |
|---------|--------------|---------------------|--------------|
| **WalletConnect** | https://cloud.walletconnect.com/ | `VITE_WALLETCONNECT_PROJECT_ID` | Wallet connection |
| **Stripe (Test)** | https://dashboard.stripe.com/test/apikeys | `STRIPE_SECRET_KEY`<br>`STRIPE_PUBLISHABLE_KEY` | Payments |
| **Stripe Crypto** | Request access in Stripe Dashboard | Same as above | Crypto onramp |
| **Spectrum** (optional) | https://spectrumnodes.com/ | `SPECTRUM_API_KEY` | Enterprise RPC |

### Required Configuration

| Item | Value | Where to Set |
|------|-------|--------------|
| **MUSD Token Address** | `0x...` (from deployment) | Both frontend & backend |
| **Backend URL** | From Railway/Heroku | Frontend only |
| **Frontend URL** | From Vercel | Backend CORS |
| **JWT Secret** | Random string | Backend only |

---

## 🔧 Environment Variables Reference

### Frontend (Vercel)

```bash
# Required
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_MUSD_TOKEN_ADDRESS=0xYourTokenAddress
VITE_PAYMENT_SERVICE_URL=https://your-backend.railway.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key

# RPC Configuration (choose one)
# Option 1: Public RPC (Free)
VITE_MEZO_RPC_URL=https://testnet-rpc.mezo.org
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet

# Option 2: Boar Network (Premium, Recommended)
VITE_MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
VITE_MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
VITE_BOAR_API_KEY=YOUR_API_KEY
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet

# Option 3: Spectrum Nodes (Enterprise)
VITE_MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet
```

### Backend (Railway/Heroku)

```bash
# Required
NODE_ENV=production
PORT=3001
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_key
MUSD_TOKEN_ADDRESS=0xYourTokenAddress
JWT_SECRET=your_random_secret
CORS_ORIGIN=https://your-app.vercel.app

# RPC Configuration (choose one)
# Option 1: Public RPC (Free)
MEZO_RPC_URL=https://testnet-rpc.mezo.org
MEZO_CHAIN_ID=1234
MEZO_NETWORK=testnet

# Option 2: Spectrum Nodes (Paid, Better Performance)
MEZO_RPC_URL=https://mezo-testnet.spectrumnodes.com/v1/YOUR_API_KEY
MEZO_CHAIN_ID=1234
MEZO_NETWORK=testnet
SPECTRUM_API_KEY=YOUR_API_KEY

# Auto-configured by Railway/Heroku
DATABASE_URL=postgresql://...
```

---

## 🐛 Common Issues & Quick Fixes

### Issue: "Failed to create onramp session"

**Quick Fix:**
```bash
# 1. Get real Stripe keys from dashboard
# 2. Update environment variables
railway variables set STRIPE_SECRET_KEY=sk_test_your_real_key
railway variables set STRIPE_PUBLISHABLE_KEY=pk_test_your_real_key

# 3. Request Stripe Crypto Onramp access
# Go to: https://dashboard.stripe.com/ → Crypto → Request Access
```

**📖 Details:** `DEPLOYMENT_RESOLUTION.md`

---

### Issue: CORS errors

**Quick Fix:**
```bash
# Update backend CORS to match frontend URL exactly
railway variables set CORS_ORIGIN=https://your-app.vercel.app
# No trailing slash!
```

---

### Issue: Environment variables not working

**Quick Fix:**
```bash
# Vercel: Redeploy after adding variables
vercel --prod

# Railway: Variables are applied immediately, but redeploy to be sure
railway up
```

---

### Issue: Wallet won't connect

**Quick Fix:**
```bash
# 1. Get WalletConnect Project ID
# Visit: https://cloud.walletconnect.com/

# 2. Add to Vercel
vercel env add VITE_WALLETCONNECT_PROJECT_ID
# Enter your project ID

# 3. Redeploy
vercel --prod
```

---

## 📊 Deployment Status Tracker

### Phase 1: Backend Deployment
- [ ] Railway/Heroku account created
- [ ] PostgreSQL database added
- [ ] Environment variables configured
- [ ] Backend deployed successfully
- [ ] Health endpoint responding: `curl https://your-backend.railway.app/health`
- [ ] Backend URL saved for frontend config

### Phase 2: Frontend Deployment
- [ ] Vercel account created
- [ ] Environment variables configured
- [ ] Frontend deployed successfully
- [ ] Site loads without errors
- [ ] Frontend URL saved for backend CORS

### Phase 3: Integration
- [ ] Backend CORS updated with frontend URL
- [ ] Frontend configured with backend URL
- [ ] Stripe webhook configured
- [ ] All services redeployed

### Phase 4: Testing
- [ ] Site loads correctly
- [ ] Wallet connection works
- [ ] MUSD balance displays
- [ ] "Buy MUSD" button works (may show error until Stripe Crypto approved)
- [ ] No console errors

### Phase 5: Stripe Crypto Onramp
- [ ] Access requested from Stripe
- [ ] Approval received (can take 1-4 weeks)
- [ ] Complete payment flow tested
- [ ] Ready for production

---

## 🎯 Quick Commands

### Deploy Backend
```bash
cd payment-service
railway up
```

### Deploy Frontend
```bash
cd dapp
vercel --prod
```

### View Logs
```bash
# Backend
railway logs

# Frontend
vercel logs
```

### Update Environment Variable
```bash
# Backend
railway variables set KEY=value

# Frontend
vercel env add KEY
```

### Test Deployment
```bash
# Backend health check
curl https://your-backend.railway.app/health

# Frontend
curl https://your-app.vercel.app
```

---

## 📚 Documentation Index

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **VERCEL_DEPLOYMENT.md** | Complete Vercel + Railway deployment guide | Primary deployment guide |
| **SPECTRUM_DEPLOYMENT.md** | Enterprise deployment with Spectrum Nodes | For production/high-traffic apps |
| **DEPLOYMENT_RESOLUTION.md** | Explains current errors and how deployment fixes them | Understanding the "Failed to create onramp session" error |
| **DEPLOYMENT_CHECKLIST.md** | Comprehensive deployment checklist | Ensuring nothing is missed |
| **TROUBLESHOOTING.md** | Common issues and solutions | When something goes wrong |
| **API_KEYS_SETUP.md** | How to get all required API keys | Setting up API keys |
| **QUICK_START.md** | Local development setup | Running locally |

---

## 💰 Cost Breakdown

### Free Tier (Development)
- Vercel: Free
- Railway: $5/month (or free with GitHub Student)
- Stripe: Free (test mode)
- RPC: Public (free)
- **Total: $0-5/month**

### Production (Standard)
- Vercel Pro: $20/month
- Railway: $20-50/month
- PostgreSQL: Included
- Stripe: 2.9% + $0.30 per transaction
- RPC: Public (free)
- **Total: $40-70/month + transaction fees**

### Production (Premium with Boar Network)
- Vercel Pro: $20/month
- Railway: $20-50/month
- Boar Network: Custom pricing (contact for quote)
- Stripe: 2.9% + $0.30 per transaction
- **Total: $40-70/month + Boar Network fees + transaction fees**

### Production (Enterprise with Spectrum)
- Vercel Pro: $20/month
- Railway: $20-50/month
- Spectrum Business: $169/month
- Stripe: 2.9% + $0.30 per transaction
- **Total: $209-239/month + transaction fees**

---

## 🚦 Deployment Timeline

### Immediate (30-60 minutes)
1. Deploy backend to Railway
2. Deploy frontend to Vercel
3. Configure environment variables
4. Test basic functionality

### Short Term (1-2 days)
1. Get all API keys
2. Configure Stripe webhooks
3. Test complete flow
4. Fix any issues

### Medium Term (1-4 weeks)
1. Wait for Stripe Crypto Onramp approval
2. Test payment flow
3. Prepare for production

### Production (After approval)
1. Switch to live Stripe keys
2. Deploy MUSD to mainnet
3. Update to mainnet RPC
4. Launch to users

---

## 🆘 Need Help?

### Documentation
- Start with `VERCEL_DEPLOYMENT.md` for step-by-step instructions
- Check `TROUBLESHOOTING.md` for common issues
- Read `DEPLOYMENT_RESOLUTION.md` to understand current errors

### Support Resources
- **Vercel**: https://vercel.com/docs
- **Railway**: https://docs.railway.app/
- **Stripe**: https://stripe.com/docs
- **WalletConnect**: https://docs.walletconnect.com/
- **Spectrum**: https://docs.spectrumnodes.com/

---

**Last Updated:** November 2, 2025  
**Status:** Ready for Deployment  
**Next Step:** Follow `VERCEL_DEPLOYMENT.md`
