# 🚂 Railway Web Deployment (No CLI Needed!)

## ⏰ Faster Alternative - Use Railway Dashboard

Since Railway CLI isn't working, we'll use the web interface - it's actually easier and faster!

## 🚀 Step-by-Step Railway Web Deployment (15 minutes)

### Step 1: Push Code to GitHub First (5 minutes)

```bash
# From project root
git add .
git commit -m "feat: MUSD payment integration for Encode Mezo Hackathon"
git push origin main
```

**CRITICAL:** Railway needs your code on GitHub to deploy it.

---

### Step 2: Deploy via Railway Dashboard (10 minutes)

1. **Go to Railway Dashboard**
   - Visit: https://railway.app/dashboard
   - Login with your account

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Authorize Railway to access your GitHub
   - Select your repository
   - Select the `payment-service` folder as root directory

3. **Add PostgreSQL Database**
   - In your project, click "New"
   - Select "Database"
   - Choose "PostgreSQL"
   - Railway will automatically create and link it

4. **Configure Environment Variables**
   - Click on your service (payment-service)
   - Go to "Variables" tab
   - Click "Raw Editor"
   - Paste this (replace YOUR_API_KEY with your actual Boar Network key):

```bash
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
JWT_SECRET=your_random_secret_here_use_any_long_string
CORS_ORIGIN=*
```

5. **Generate Domain**
   - Go to "Settings" tab
   - Scroll to "Networking"
   - Click "Generate Domain"
   - Copy your domain (e.g., `musd-payment-service-production.up.railway.app`)
   - **SAVE THIS URL!** You need it for frontend

6. **Deploy**
   - Railway will automatically deploy
   - Watch the "Deployments" tab
   - Wait for "Success" status (2-3 minutes)

7. **Test Backend**
   - Open: `https://your-railway-domain.railway.app/health`
   - Should see: `{"status":"ok","timestamp":"..."}`

---

## ✅ Alternative: Use Render.com (Even Easier!)

If Railway is giving you trouble, Render is even simpler:

### Render Deployment (10 minutes)

1. **Go to Render Dashboard**
   - Visit: https://render.com/
   - Sign up/Login (free tier available)

2. **Create New Web Service**
   - Click "New +"
   - Select "Web Service"
   - Connect your GitHub repository
   - Select `payment-service` folder

3. **Configure Service**
   - Name: `musd-payment-service`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: `Free`

4. **Add PostgreSQL Database**
   - Click "New +"
   - Select "PostgreSQL"
   - Name: `musd-db`
   - Free tier
   - Copy the "Internal Database URL"

5. **Add Environment Variables**
   - In your web service, go to "Environment"
   - Add these variables:

```bash
NODE_ENV=production
PORT=3001
DATABASE_URL=[paste internal database URL from step 4]
MEZO_RPC_URL=https://mezo-rpc.boar.network/v1/YOUR_API_KEY
MEZO_WSS_URL=wss://mezo-wss.boar.network/v1/YOUR_API_KEY
BOAR_API_KEY=YOUR_API_KEY
MEZO_CHAIN_ID=1234
MEZO_NETWORK=testnet
MUSD_TOKEN_ADDRESS=0x9d4454B023096f34B160D6B654540c56A1F81688
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
JWT_SECRET=your_random_secret_here
CORS_ORIGIN=*
```

6. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (3-5 minutes)
   - Copy your service URL (e.g., `musd-payment-service.onrender.com`)

7. **Test**
   - Open: `https://your-service.onrender.com/health`

---

## 🎯 Which One to Use?

### Use Railway if:
- ✅ You already have an account
- ✅ You want faster deployments
- ✅ You're comfortable with the UI

### Use Render if:
- ✅ Railway isn't working
- ✅ You want simpler setup
- ✅ You prefer clearer documentation

**Both are free and work great for hackathons!**

---

## 🚨 Quick Troubleshooting

### Railway Issues:
- **Build fails:** Check logs in "Deployments" tab
- **Can't connect GitHub:** Re-authorize in Settings
- **Database not connecting:** Check if DATABASE_URL is auto-set

### Render Issues:
- **Build fails:** Check build logs
- **Service won't start:** Verify start command is `npm start`
- **Database connection:** Ensure DATABASE_URL is set

---

## ⏭️ Next Steps After Backend Deploys

1. **Save your backend URL**
2. **Test the health endpoint**
3. **Move to frontend deployment (Vercel)**
4. **Vercel is easier - uses web UI by default!**

---

## 🆘 If Both Fail - Use Vercel for Backend Too!

Vercel can also host Node.js backends:

1. Go to https://vercel.com/
2. Import your repository
3. Select `payment-service` folder
4. Add environment variables
5. Deploy

**But Railway or Render are better for backends with databases.**

---

**Time saved by using web UI: 10 minutes!**  
**No CLI installation needed!**  
**Just point, click, deploy!** 🚀

