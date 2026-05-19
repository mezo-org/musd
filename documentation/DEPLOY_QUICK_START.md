# 🚀 DEPLOY NOW - Simple 3-Step Guide

## ⏰ 3 Hours to Submission - Let's Go!

## Step 1: Push to GitHub (5 minutes)

```bash
git add .
git commit -m "feat: MUSD payment integration for Encode Mezo Hackathon"
git push origin main
```

✅ **Done? Move to Step 2**

---

## Step 2: Deploy Backend (15 minutes)

### Option A: Railway (Recommended)

1. Go to: https://railway.app/dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository → Choose `payment-service` folder
4. Click "New" → "Database" → "PostgreSQL"
5. Click your service → "Variables" → "Raw Editor"
6. Paste this (replace YOUR_API_KEY with your Boar Network key):

```
NODE_ENV=production
PORT=3001
MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
BOAR_API_KEY=YOUR_API_KEY
MEZO_CHAIN_ID=1234
MEZO_NETWORK=testnet
MUSD_TOKEN_ADDRESS=0x9d4454B023096f34B160D6B654540c56A1F81688
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
JWT_SECRET=any_long_random_string_here_123456789
CORS_ORIGIN=*
```

7. Settings → Networking → "Generate Domain"
8. **SAVE YOUR BACKEND URL!** (e.g., `https://xxx.railway.app`)
9. Test: Open `https://your-url.railway.app/health`

### Option B: Render.com (If Railway doesn't work)

1. Go to: https://render.com/
2. Click "New +" → "Web Service"
3. Connect GitHub → Select repository → Choose `payment-service`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add same environment variables as above
7. Click "Create Web Service"
8. **SAVE YOUR BACKEND URL!**

✅ **Backend deployed? Move to Step 3**

---

## Step 3: Deploy Frontend (15 minutes)

1. Go to: https://vercel.com/
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Root Directory: `dapp`
5. Framework Preset: Vite
6. Click "Deploy" (will fail first time - that's OK!)
7. Go to Settings → Environment Variables
8. Add these variables:

```
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_or_leave_empty
VITE_MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
VITE_MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
VITE_BOAR_API_KEY=YOUR_API_KEY
VITE_MEZO_CHAIN_ID=1234
VITE_MEZO_NETWORK=testnet
VITE_MUSD_TOKEN_ADDRESS=0x9d4454B023096f34B160D6B654540c56A1F81688
VITE_PAYMENT_SERVICE_URL=https://your-backend-url.railway.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
```

9. Go to Deployments → Click "..." → "Redeploy"
10. **SAVE YOUR FRONTEND URL!** (e.g., `https://xxx.vercel.app`)

✅ **Frontend deployed? Test it!**

---

## Step 4: Test Your Demo (10 minutes)

1. Open your Vercel URL in browser
2. Does it load? ✅
3. Click "Connect Wallet" - does it work? ✅
4. Check MUSD balance - does it show? ✅
5. Take 3 screenshots:
   - Landing page
   - Wallet connected
   - MUSD balance

✅ **Demo works? Move to submission!**

---

## Step 5: Submit (20 minutes)

1. **Update HACKATHON_SUBMISSION.md**
   - Replace `[YOUR_VERCEL_URL]` with your actual URL
   - Replace `[YOUR_RAILWAY_URL]` with your actual URL
   - Replace `[YOUR_GITHUB_URL]` with your repo URL

2. **Record 2-minute video** (use Loom.com)
   - Show landing page
   - Connect wallet
   - Show MUSD balance
   - Explain the project

3. **Final git push**
   ```bash
   git add .
   git commit -m "docs: add deployment URLs for hackathon submission"
   git push origin main
   ```

4. **Submit to hackathon**
   - Demo URL: Your Vercel URL
   - GitHub: Your repo URL
   - Video: Your Loom URL

✅ **DONE!** 🎉

---

## 🚨 Troubleshooting

### Backend won't deploy
- Check logs in Railway/Render dashboard
- Verify all environment variables are set
- Make sure `payment-service` folder is selected

### Frontend won't build
- Check build logs in Vercel
- Verify environment variables are set
- Try redeploying after adding variables

### Wallet won't connect
- This is OK for demo! Document it
- WalletConnect Project ID is optional

### "Failed to create onramp session" error
- This is EXPECTED! Stripe Crypto needs approval
- Document this in your README
- Judges will understand

---

## ⏰ Time Breakdown

- Git push: 5 min
- Backend deploy: 15 min
- Frontend deploy: 15 min
- Testing: 10 min
- Video: 15 min
- Submission: 10 min
- **Total: 70 minutes**
- **Buffer: 110 minutes for issues**

---

## 🎯 Minimum Viable Submission

If running out of time, you MUST have:

1. ✅ Working demo URL (Vercel)
2. ✅ Backend deployed (Railway/Render)
3. ✅ GitHub repository public
4. ✅ Basic README with demo link

Everything else is bonus!

---

## 📋 URLs to Save

Write these down as you deploy:

- **Backend URL:** ___________________________
- **Frontend URL:** ___________________________
- **GitHub URL:** ___________________________
- **Video URL:** ___________________________

---

## 🚀 START NOW!

**First command:**
```bash
git add .
git commit -m "feat: MUSD payment integration for Encode Mezo Hackathon"
git push origin main
```

**Then go to:** https://railway.app/dashboard

**GO! GO! GO!** ⏰

