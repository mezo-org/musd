# Encode Mezo Hackathon - Rapid Deployment Plan

## ⏰ Timeline: 3 Hours to Submission

## 🎯 Hackathon Requirements
- ✅ Project integrates MUSD
- ⚠️ **CRITICAL:** Working demo on testnet (REQUIRED)
- ✅ Original work / new approach
- ⏳ KYB for prize distribution (after submission)
- ⏳ Mainnet deployment (for incentives, not required for submission)

## 🚀 Rapid Deployment Strategy (3 Hours)

### Hour 1: Backend Deployment (60 minutes)

#### Step 1: Deploy Payment Service to Railway (20 min)
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Deploy backend
cd payment-service
railway init
railway add --database postgresql

# 4. Set environment variables (CRITICAL)
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

# 5. Deploy
railway up

# 6. Get backend URL
railway domain
# Save this URL!
```

#### Step 2: Test Backend (5 min)
```bash
# Test health endpoint
curl https://your-backend.railway.app/health

# Expected: {"status":"ok","timestamp":"..."}
```

#### Step 3: Push to GitHub (10 min)
```bash
# From project root
git add .
git commit -m "feat: MUSD payment integration for Encode Mezo Hackathon"
git push origin main
```

#### Step 4: Create README for Hackathon (25 min)
Create compelling README with:
- Project description
- MUSD integration details
- Demo video/screenshots
- Architecture diagram
- Setup instructions

---

### Hour 2: Frontend Deployment (60 minutes)

#### Step 1: Update Environment Variables (10 min)
```bash
cd dapp

# Update .env with your actual values
cat > .env << EOF
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
VITE_MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
VITE_BOAR_API_KEY=YOUR_API_KEY
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet
VITE_MUSD_TOKEN_ADDRESS=0x9d4454B023096f34B160D6B654540c56A1F81688
VITE_PAYMENT_SERVICE_URL=https://your-backend.railway.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
EOF
```

#### Step 2: Deploy to Vercel (15 min)
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel

# 4. Configure environment variables in Vercel Dashboard
# Go to: https://vercel.com/dashboard
# Settings → Environment Variables
# Add all variables from .env

# 5. Deploy to production
vercel --prod

# 6. Get frontend URL
# Save this URL!
```

#### Step 3: Update Backend CORS (5 min)
```bash
cd ../payment-service
railway variables set CORS_ORIGIN=https://your-app.vercel.app
```

#### Step 4: Test Complete Flow (30 min)
1. Open Vercel URL in browser
2. Connect Bitcoin wallet (Unisat/OKX/Xverse)
3. Check MUSD balance
4. Test "Buy MUSD" button (may show error - expected without Stripe Crypto)
5. Take screenshots/record video
6. Document any issues

---

### Hour 3: Submission Preparation (60 minutes)

#### Step 1: Create Hackathon README (20 min)

Create `HACKATHON_SUBMISSION.md`:

```markdown
# MUSD Payment Integration - Encode Mezo Hackathon

## 🎯 Project Overview
Self-service banking on Bitcoin rails using MUSD for everyday payments.

## 🌟 Track: Daily Bitcoin Applications - For Everyone

## 💡 Problem
Bitcoin holders can't easily use their MUSD for everyday purchases without complex DeFi interactions.

## ✅ Solution
Simple payment integration allowing users to:
- Buy MUSD with credit card (fiat onramp)
- Send MUSD to anyone
- View MUSD balance
- Connect Bitcoin wallet seamlessly

## 🔗 Live Demo
- **Frontend**: https://your-app.vercel.app
- **Backend**: https://your-backend.railway.app
- **GitHub**: https://github.com/your-repo

## 🏗️ Architecture
[Include architecture diagram]

## 🔧 MUSD Integration
- MUSD Token: 0x9d4454B023096f34B160D6B654540c56A1F81688
- Mezo Testnet deployment
- Mezo Passport for Bitcoin wallet connection
- Smart account abstraction (Matsnet)

## 🎥 Demo Video
[Link to demo video]

## 📸 Screenshots
[Include screenshots]

## 🚀 Technical Highlights
- React + TypeScript frontend
- Node.js + Express backend
- Mezo Passport integration
- Stripe Crypto Onramp (ready for production)
- PostgreSQL database
- Boar Network RPC infrastructure

## 🏆 Judging Criteria Alignment

### Mezo Integration (30%)
- ✅ MUSD token integration
- ✅ Mezo Passport for wallet connection
- ✅ Smart account abstraction
- ✅ Testnet deployment

### Technical Implementation (30%)
- ✅ Clean architecture
- ✅ TypeScript for type safety
- ✅ Error handling
- ✅ Security best practices

### Business Viability (20%)
- ✅ Solves real problem (Bitcoin payment friction)
- ✅ Clear target market (Bitcoin holders)
- ✅ Scalable solution

### User Experience (10%)
- ✅ Simple, intuitive interface
- ✅ One-click wallet connection
- ✅ Clear balance display

### Presentation Quality (10%)
- ✅ Clear demo
- ✅ Comprehensive documentation
- ✅ Professional presentation

## 🔮 Future Roadmap
1. Stripe Crypto Onramp approval
2. Mainnet deployment
3. Mobile app
4. Additional payment methods
5. Merchant integration

## 👥 Team
[Your team info]

## 📄 License
MIT
```

#### Step 2: Record Demo Video (20 min)
1. Use Loom or similar tool
2. Show:
   - Landing page
   - Wallet connection
   - MUSD balance
   - Buy MUSD flow (even if error)
   - Send MUSD functionality
3. Keep it under 3 minutes
4. Upload to YouTube/Loom

#### Step 3: Take Screenshots (10 min)
1. Landing page
2. Wallet connected
3. MUSD balance display
4. Buy MUSD interface
5. Send MUSD interface
6. Architecture diagram

#### Step 4: Final Submission (10 min)
1. Update GitHub README
2. Ensure all links work
3. Test demo URL one more time
4. Submit to hackathon platform

---

## 🎯 Critical Path (Minimum Viable Submission)

If running out of time, focus on these essentials:

### Must Have (60 min)
1. ✅ Backend deployed to Railway (20 min)
2. ✅ Frontend deployed to Vercel (20 min)
3. ✅ Working demo URL (10 min)
4. ✅ Basic README with demo link (10 min)

### Should Have (30 min)
5. ✅ Demo video (15 min)
6. ✅ Screenshots (10 min)
7. ✅ GitHub pushed (5 min)

### Nice to Have (30 min)
8. ✅ Comprehensive documentation
9. ✅ Architecture diagrams
10. ✅ Troubleshooting guide

---

## 🚨 Common Issues & Quick Fixes

### Issue: Railway deployment fails
**Fix:** Check logs with `railway logs`, ensure all env vars are set

### Issue: Vercel build fails
**Fix:** Run `npm run build` locally first, fix any TypeScript errors

### Issue: CORS errors
**Fix:** Set `CORS_ORIGIN=*` in Railway for demo (not production!)

### Issue: Wallet won't connect
**Fix:** Ensure WalletConnect Project ID is set in Vercel env vars

### Issue: MUSD balance shows 0
**Fix:** This is expected if wallet has no MUSD - document in README

### Issue: "Failed to create onramp session"
**Fix:** This is expected without Stripe Crypto approval - document in README

---

## 📋 Pre-Deployment Checklist

### Backend
- [ ] Railway account created
- [ ] PostgreSQL database added
- [ ] All environment variables set
- [ ] Backend deployed successfully
- [ ] Health endpoint responding
- [ ] Backend URL saved

### Frontend
- [ ] Vercel account created
- [ ] Environment variables configured
- [ ] Frontend deployed successfully
- [ ] Demo URL accessible
- [ ] Wallet connection works
- [ ] Frontend URL saved

### GitHub
- [ ] Code pushed to GitHub
- [ ] README updated
- [ ] Repository public
- [ ] All documentation included

### Submission
- [ ] Demo video recorded
- [ ] Screenshots taken
- [ ] HACKATHON_SUBMISSION.md created
- [ ] All links tested
- [ ] Submission form filled

---

## 🎬 Deployment Commands (Copy-Paste Ready)

### Backend Deployment
```bash
cd payment-service
npm install -g @railway/cli
railway login
railway init
railway add --database postgresql
railway variables set NODE_ENV=production PORT=3001 MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY MEZO_CHAIN_ID=1234 MEZO_NETWORK=testnet MUSD_TOKEN_ADDRESS=0x9d4454B023096f34B160D6B654540c56A1F81688 CORS_ORIGIN=* JWT_SECRET=$(openssl rand -base64 32)
railway up
railway domain
```

### Frontend Deployment
```bash
cd dapp
npm install -g vercel
vercel login
vercel
# Configure env vars in dashboard
vercel --prod
```

### Git Push
```bash
git add .
git commit -m "feat: MUSD payment integration for Encode Mezo Hackathon"
git push origin main
```

---

## 🏆 Success Criteria

### Minimum (Required for Submission)
- ✅ Working testnet deployment
- ✅ Demo URL accessible
- ✅ MUSD integration visible
- ✅ Basic documentation

### Ideal (Competitive Submission)
- ✅ All of the above
- ✅ Demo video
- ✅ Screenshots
- ✅ Comprehensive README
- ✅ Clean, professional presentation

---

## ⏰ Time Allocation

| Task | Time | Priority |
|------|------|----------|
| Backend deployment | 20 min | CRITICAL |
| Frontend deployment | 20 min | CRITICAL |
| Testing | 20 min | CRITICAL |
| README | 20 min | HIGH |
| Demo video | 20 min | HIGH |
| Screenshots | 10 min | MEDIUM |
| Git push | 10 min | HIGH |
| Final checks | 20 min | HIGH |
| **TOTAL** | **140 min** | **(2h 20m)** |

**Buffer:** 40 minutes for issues

---

## 🎯 Next Steps (RIGHT NOW)

1. **Start Backend Deployment** (NOW)
   ```bash
   cd payment-service
   railway login
   railway init
   ```

2. **While backend deploys, update frontend .env** (5 min)

3. **Deploy frontend to Vercel** (15 min)

4. **Test and document** (20 min)

5. **Create submission materials** (40 min)

6. **Submit!** 🎉

---

**Status:** Ready for Rapid Deployment  
**Time Remaining:** 3 hours  
**Priority:** CRITICAL - Testnet deployment required  
**Next Action:** Start backend deployment NOW

