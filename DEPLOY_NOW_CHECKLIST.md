# 🚨 DEPLOY NOW - 3 Hour Countdown Checklist

## ⏰ Current Status: 3 HOURS TO SUBMISSION

## 🎯 CRITICAL PATH - DO THESE IN ORDER

### ✅ Step 1: Push to GitHub (5 minutes) - DO THIS FIRST!

```bash
# From project root
git status
git add .
git commit -m "feat: MUSD payment integration for Encode Mezo Hackathon - testnet deployment ready"
git push origin main
```

**Why first?** Ensures your code is backed up and accessible for submission.

---

### ✅ Step 2: Deploy Backend to Railway (20 minutes)

```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Navigate to payment service
cd payment-service

# Initialize Railway project
railway init
# Choose: "Create new project"
# Name it: "musd-payment-service"

# Add PostgreSQL database
railway add --database postgresql

# Set ALL environment variables (CRITICAL!)
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
railway variables set MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
railway variables set BOAR_API_KEY=YOUR_API_KEY
railway variables set MEZO_CHAIN_ID=1234
railway variables set MEZO_NETWORK=testnet
railway variables set MUSD_TOKEN_ADDRESS=0x9d4454B023096f34B160D6B654540c56A1F81688
railway variables set STRIPE_SECRET_KEY=sk_test_placeholder
railway variables set STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
railway variables set JWT_SECRET=$(openssl rand -base64 32)
railway variables set CORS_ORIGIN=*

# Deploy!
railway up

# Get your backend URL
railway domain
```

**Save your backend URL!** You'll need it for frontend deployment.

**Test it:**
```bash
curl https://your-backend-url.railway.app/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

### ✅ Step 3: Deploy Frontend to Vercel (20 minutes)

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login to Vercel
vercel login

# Navigate to dapp
cd ../dapp

# Deploy (will prompt for configuration)
vercel
# Choose: "Create new project"
# Name it: "musd-payment-gateway"

# Configure environment variables in Vercel Dashboard
# Go to: https://vercel.com/dashboard
# Click your project → Settings → Environment Variables
# Add these variables:

VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
VITE_MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
VITE_MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
VITE_BOAR_API_KEY=YOUR_API_KEY
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet
VITE_MUSD_TOKEN_ADDRESS=0x9d4454B023096f34B160D6B654540c56A1F81688
VITE_PAYMENT_SERVICE_URL=https://your-backend-url.railway.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder

# Deploy to production
vercel --prod
```

**Save your frontend URL!** This is your demo URL.

---

### ✅ Step 4: Test Your Deployment (15 minutes)

1. **Open your Vercel URL in browser**
   - Does it load? ✅
   - Any console errors? Check and note them

2. **Test Wallet Connection**
   - Click "Connect Wallet"
   - Try connecting with Unisat/OKX/Xverse
   - Does it connect? ✅

3. **Check MUSD Balance**
   - Does balance display? ✅
   - Showing 0 is OK if wallet has no MUSD

4. **Test Buy MUSD**
   - Click "Buy MUSD with Card"
   - Error is EXPECTED (no Stripe Crypto approval yet)
   - Document this in README

5. **Take Screenshots**
   - Landing page
   - Wallet connected
   - MUSD balance
   - Buy MUSD interface
   - Any errors (for documentation)

---

### ✅ Step 5: Update HACKATHON_SUBMISSION.md (20 minutes)

```bash
# Edit HACKATHON_SUBMISSION.md
# Replace these placeholders:

[YOUR_VERCEL_URL] → https://your-actual-vercel-url.vercel.app
[YOUR_RAILWAY_URL] → https://your-actual-railway-url.railway.app
[YOUR_GITHUB_URL] → https://github.com/your-username/your-repo
[YOUR_VIDEO_URL] → (record video in next step)

# Add your team information
# Add screenshots
# Update any other placeholders
```

---

### ✅ Step 6: Record Demo Video (20 minutes)

**Use Loom (https://loom.com) or similar**

**Script (2-3 minutes):**

1. **Intro (15 seconds)**
   - "Hi, I'm [name] presenting MUSD Payment Gateway"
   - "Making MUSD payments as easy as using a credit card"

2. **Problem (20 seconds)**
   - "Bitcoin holders who mint MUSD face friction using it"
   - "Complex DeFi interfaces, no simple fiat onramp"

3. **Solution Demo (90 seconds)**
   - Show landing page
   - Connect Bitcoin wallet
   - Show MUSD balance
   - Demonstrate buy MUSD interface
   - Show send MUSD functionality

4. **Technical Highlights (20 seconds)**
   - "Built with Mezo Passport for wallet integration"
   - "Deployed on Mezo testnet"
   - "Ready for production with Stripe Crypto Onramp"

5. **Closing (15 seconds)**
   - "Try it at [your-url]"
   - "Thank you!"

**Upload to YouTube or Loom and get the link**

---

### ✅ Step 7: Update README.md (15 minutes)

Add to the top of README.md:

```markdown
# 🏆 Encode Mezo Hackathon Submission

**🔗 Live Demo:** https://your-vercel-url.vercel.app  
**🎥 Demo Video:** https://your-video-url  
**📄 Full Submission:** [HACKATHON_SUBMISSION.md](HACKATHON_SUBMISSION.md)

## Quick Start

This project integrates MUSD for everyday Bitcoin payments.

### Try the Demo
1. Visit https://your-vercel-url.vercel.app
2. Connect your Bitcoin wallet (Unisat, OKX, or Xverse)
3. View your MUSD balance
4. Try buying MUSD with credit card
5. Send MUSD to anyone

### MUSD Integration
- **Token Address:** 0x9d4454B023096f34B160D6B654540c56A1F81688
- **Network:** Mezo Testnet
- **Chain ID:** 1234

---

[Rest of existing README content]
```

---

### ✅ Step 8: Final Git Push (5 minutes)

```bash
# From project root
git add .
git commit -m "docs: add hackathon submission materials and demo URLs"
git push origin main
```

---

### ✅ Step 9: Submit to Hackathon (10 minutes)

1. **Go to hackathon submission portal**
2. **Fill in the form:**
   - Project Name: MUSD Payment Gateway
   - Track: Daily Bitcoin Applications - For Everyone
   - Demo URL: https://your-vercel-url.vercel.app
   - GitHub URL: https://github.com/your-username/your-repo
   - Video URL: https://your-video-url
   - Description: Copy from HACKATHON_SUBMISSION.md

3. **Submit!** 🎉

---

## 🚨 IF YOU'RE RUNNING OUT OF TIME

### Absolute Minimum (60 minutes)

1. **Deploy Backend** (20 min)
2. **Deploy Frontend** (20 min)
3. **Test Demo URL** (10 min)
4. **Update README with demo URL** (5 min)
5. **Git push** (5 min)

Skip video and detailed docs if necessary - **working demo is most important!**

---

## 📋 Pre-Flight Checklist

Before you start deploying:

- [ ] You have Boar Network API key
- [ ] You have WalletConnect Project ID (or can skip for now)
- [ ] You have Railway account (or can create quickly)
- [ ] You have Vercel account (or can create quickly)
- [ ] You have GitHub account
- [ ] Your code is ready to deploy

---

## 🆘 Emergency Contacts

If something breaks:

1. **Check logs:**
   - Railway: `railway logs`
   - Vercel: Check dashboard
   - Browser: F12 → Console

2. **Common fixes:**
   - CORS error: Set `CORS_ORIGIN=*` in Railway
   - Build error: Check TypeScript errors locally
   - Env vars: Double-check all variables are set

3. **Skip if broken:**
   - Stripe integration (document as "pending approval")
   - WebSocket (use HTTP RPC only)
   - Advanced features (focus on core demo)

---

## ✅ Success Criteria

### Must Have
- ✅ Working demo URL
- ✅ Wallet connection works
- ✅ MUSD balance displays
- ✅ GitHub repository public
- ✅ Basic README with demo link

### Should Have
- ✅ Demo video
- ✅ Screenshots
- ✅ HACKATHON_SUBMISSION.md
- ✅ All features working

### Nice to Have
- ✅ Comprehensive documentation
- ✅ Professional presentation
- ✅ All edge cases handled

---

## ⏰ Time Tracking

| Task | Estimated | Actual | Status |
|------|-----------|--------|--------|
| Git push | 5 min | ___ | ⏳ |
| Backend deploy | 20 min | ___ | ⏳ |
| Frontend deploy | 20 min | ___ | ⏳ |
| Testing | 15 min | ___ | ⏳ |
| Submission doc | 20 min | ___ | ⏳ |
| Demo video | 20 min | ___ | ⏳ |
| README update | 15 min | ___ | ⏳ |
| Final push | 5 min | ___ | ⏳ |
| Submit | 10 min | ___ | ⏳ |
| **TOTAL** | **130 min** | ___ | ⏳ |

**Buffer:** 50 minutes for issues

---

## 🎯 START NOW!

**Current time:** ___________  
**Submission deadline:** ___________  
**Time remaining:** 3 hours

**First command to run:**
```bash
git add .
git commit -m "feat: MUSD payment integration for Encode Mezo Hackathon"
git push origin main
```

**GO! GO! GO!** 🚀

