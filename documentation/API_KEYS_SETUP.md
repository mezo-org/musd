# API Keys Setup Guide

This guide will help you obtain and configure all necessary API keys for the MUSD Payment Integration.

## 🔑 Required API Keys

1. **WalletConnect Project ID** - For Bitcoin wallet connections
2. **Stripe API Keys** - For payment processing

---

## 1. WalletConnect Project ID

### Get Your Project ID

1. **Visit WalletConnect Cloud**
   - Go to: https://cloud.walletconnect.com/

2. **Sign Up / Sign In**
   - Create an account or sign in with existing credentials
   - You can use GitHub, Google, or email

3. **Create a New Project**
   - Click "Create Project" or "New Project"
   - Enter project details:
     - **Name**: MUSD Payment Integration
     - **Description**: Bitcoin wallet integration for MUSD payments
     - **Homepage URL**: http://localhost:5175 (for development)

4. **Copy Your Project ID**
   - Once created, you'll see your Project ID
   - It looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
   - Copy this ID

### Configure in Your App

Update `dapp/.env`:
```bash
VITE_WALLETCONNECT_PROJECT_ID=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**Important:** 
- ✅ Keep this ID secure but it's safe to use in frontend code
- ✅ Add your production domain to allowed origins in WalletConnect dashboard
- ❌ Don't commit `.env` file to git (already in .gitignore)

---

## 2. Stripe API Keys

### Get Your API Keys

1. **Visit Stripe Dashboard**
   - Go to: https://dashboard.stripe.com/
   - Sign up or sign in

2. **Switch to Test Mode**
   - In the top right, toggle to **Test mode**
   - This gives you test keys that won't charge real money

3. **Get Your API Keys**
   - Go to: **Developers** → **API keys**
   - You'll see two keys:
     - **Publishable key** (starts with `pk_test_`)
     - **Secret key** (starts with `sk_test_`)
   - Click "Reveal test key" for the secret key
   - Copy both keys

### Configure in Your Apps

#### Frontend (dapp/.env)
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51Abc123...xyz
```

#### Backend (payment-service/.env)
```bash
STRIPE_SECRET_KEY=sk_test_51Abc123...xyz
STRIPE_PUBLISHABLE_KEY=pk_test_51Abc123...xyz
```

**Important:**
- ✅ Publishable key is safe for frontend
- ⚠️ Secret key MUST stay on backend only
- ❌ Never commit secret keys to git
- ❌ Never expose secret keys in frontend code

### Enable Stripe Crypto (Optional)

For the full onramp experience:

1. **Contact Stripe**
   - Email: crypto@stripe.com
   - Request access to Stripe Crypto Onramp

2. **Enable in Dashboard**
   - Once approved, enable in: **Settings** → **Crypto**
   - Configure supported currencies and networks

---

## 3. MUSD Token Address (After Deployment)

Once you deploy the MUSD token to Matsnet:

Update `dapp/.env`:
```bash
VITE_MUSD_TOKEN_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
```

---

## 📝 Complete Configuration Checklist

### dapp/.env
```bash
# WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here

# MUSD Token
VITE_MUSD_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
VITE_MUSD_NETWORK=matsnet
VITE_MUSD_CHAIN_ID=1234

# Payment Service
VITE_PAYMENT_SERVICE_URL=http://localhost:3001

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

### payment-service/.env
```bash
# Server
PORT=3001
NODE_ENV=development

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# MUSD Token
MUSD_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
MUSD_NETWORK=matsnet

# Database (if needed)
# DATABASE_URL=postgresql://...
```

---

## 🧪 Testing Your Configuration

### 1. Test WalletConnect

```bash
cd dapp
npm run dev
```

- Open http://localhost:5175/
- Click "Connect Wallet"
- You should see wallet options (Unisat, OKX, Xverse)
- If you see "Invalid Project ID" error, check your WalletConnect ID

### 2. Test Stripe

```bash
cd payment-service
npm run dev
```

Check logs for:
- ✅ "Payment service running on http://localhost:3001"
- ❌ Any Stripe authentication errors

### 3. Test Complete Flow

1. Connect Bitcoin wallet
2. Click "Buy MUSD with Card"
3. You should see Stripe payment interface
4. Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

---

## 🔒 Security Best Practices

### DO ✅
- Keep secret keys in `.env` files
- Use test keys for development
- Rotate keys if compromised
- Use environment-specific keys (dev/staging/prod)
- Enable 2FA on Stripe and WalletConnect accounts

### DON'T ❌
- Commit `.env` files to git
- Share secret keys in chat/email
- Use production keys in development
- Hardcode keys in source code
- Expose secret keys in frontend code

---

## 🆘 Troubleshooting

### WalletConnect Issues

**Problem:** "Invalid Project ID"
- **Solution:** Double-check the Project ID in `.env`
- **Solution:** Restart dev server after changing `.env`

**Problem:** Wallet not connecting
- **Solution:** Check browser console for errors
- **Solution:** Ensure wallet extension is installed and unlocked
- **Solution:** Try a different wallet

### Stripe Issues

**Problem:** "Invalid API Key"
- **Solution:** Verify you copied the full key (starts with `sk_test_` or `pk_test_`)
- **Solution:** Check you're in test mode
- **Solution:** Restart payment service after changing `.env`

**Problem:** Payment fails
- **Solution:** Use test card numbers from Stripe docs
- **Solution:** Check Stripe dashboard logs
- **Solution:** Verify webhook configuration (if using webhooks)

---

## 📚 Additional Resources

- **WalletConnect Docs**: https://docs.walletconnect.com/
- **Stripe Docs**: https://stripe.com/docs
- **Stripe Test Cards**: https://stripe.com/docs/testing
- **Mezo Docs**: https://mezo.org/docs

---

## ✅ Verification

Once configured, you should be able to:
- ✅ Connect Bitcoin wallet
- ✅ See wallet balances
- ✅ View MUSD balance (0 initially)
- ✅ Click "Buy MUSD with Card" without errors
- ✅ See Stripe payment interface

**Status:** Ready for API key configuration
**Next Step:** Deploy MUSD token to Matsnet
