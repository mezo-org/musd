# Deployment Resolution - Current Issues and Fixes

## Current Error Analysis

### The Error You're Seeing

**Screenshot shows:**
```
localhost:5175 says
Error: Failed to create onramp session
[OK]
```

**What's happening:**
1. User clicks "Buy MUSD with Card"
2. Frontend calls payment service: `POST /api/v1/onramp/sessions`
3. Payment service tries to create Stripe Crypto Onramp session
4. Stripe API call fails because:
   - Stripe API keys are not configured (or are placeholder values)
   - Stripe Crypto Onramp access is not enabled
5. Error is returned to frontend and shown in alert

### Why This Happens in Development

The current setup is using **placeholder API keys** in the `.env` files:

```bash
# payment-service/.env (current)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# dapp/.env (current)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

These placeholder values cause the Stripe SDK to fail when making API calls.

## Will Deployment Resolve This?

### ✅ YES - When Properly Configured

The error **will be resolved** when you deploy with proper configuration:

1. **Real Stripe API Keys**
   - Replace placeholder keys with actual test/live keys from Stripe Dashboard
   - Keys must be valid and active

2. **Stripe Crypto Onramp Access**
   - Request and receive approval for Stripe Crypto Onramp
   - This is currently in private beta
   - Required for the onramp functionality to work

3. **Proper Environment Variables**
   - All environment variables correctly set in deployment platform
   - Backend and frontend using matching keys

### ❌ NO - If Configuration is Missing

The error **will persist** if:
- Placeholder API keys are used in production
- Stripe Crypto Onramp access is not granted
- Environment variables are not properly set

## Resolution Roadmap

### Phase 1: Local Development Fix (Immediate)

**Goal:** Get rid of the error in local development

**Steps:**
1. **Get Stripe Test API Keys**
   ```bash
   # Go to: https://dashboard.stripe.com/test/apikeys
   # Copy your keys
   ```

2. **Update payment-service/.env**
   ```bash
   STRIPE_SECRET_KEY=sk_test_51ABC...your_actual_key
   STRIPE_PUBLISHABLE_KEY=pk_test_51ABC...your_actual_key
   ```

3. **Update dapp/.env**
   ```bash
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51ABC...your_actual_key
   ```

4. **Restart both services**
   ```bash
   # Terminal 1
   cd payment-service
   npm run dev

   # Terminal 2
   cd dapp
   npm run dev
   ```

5. **Request Stripe Crypto Onramp Access**
   - Go to Stripe Dashboard → Crypto
   - Click "Request Access"
   - Explain your use case (MUSD payment integration)
   - Wait for approval

**Expected Result:**
- Error may still occur (if Crypto Onramp not approved yet)
- But you'll see better error messages in logs
- Stripe SDK will be properly initialized

### Phase 2: Staging Deployment (1-2 days)

**Goal:** Deploy to staging environment with test keys

**Steps:**
1. **Deploy Backend to Railway**
   ```bash
   cd payment-service
   railway init
   railway add --database postgresql
   railway variables set STRIPE_SECRET_KEY=sk_test_your_key
   railway variables set STRIPE_PUBLISHABLE_KEY=pk_test_your_key
   railway up
   ```

2. **Deploy Frontend to Vercel**
   ```bash
   cd dapp
   vercel
   # Configure environment variables in Vercel Dashboard
   vercel --prod
   ```

3. **Test in staging**
   - Visit your Vercel URL
   - Try the "Buy MUSD" flow
   - Check for errors

**Expected Result:**
- Same error if Crypto Onramp not approved
- But infrastructure is ready for when approval comes

### Phase 3: Stripe Crypto Onramp Approval (1-4 weeks)

**Goal:** Get Stripe Crypto Onramp access

**Steps:**
1. **Wait for Stripe approval email**
2. **Verify access in Stripe Dashboard**
   - Go to Crypto section
   - Should see "Crypto Onramp" enabled
3. **Test API access**
   ```bash
   curl https://api.stripe.com/v1/crypto/onramp_sessions \
     -u sk_test_your_key: \
     -d "transaction_details[destination_currency]=usdc" \
     -d "transaction_details[destination_network]=ethereum" \
     -d "transaction_details[wallet_address]=0x..."
   ```

**Expected Result:**
- API call succeeds
- Returns session object with `client_secret`

### Phase 4: Full Resolution (After Approval)

**Goal:** Complete working payment flow

**Steps:**
1. **Verify Stripe Crypto Onramp is enabled**
2. **No code changes needed** - existing code will work
3. **Test complete flow:**
   - Connect Bitcoin wallet ✅
   - Click "Buy MUSD with Card" ✅
   - See Stripe payment form ✅
   - Complete test payment ✅
   - Receive MUSD ✅

**Expected Result:**
- ✅ No errors
- ✅ Payment form loads
- ✅ Transactions complete successfully

### Phase 5: Production Deployment (After Testing)

**Goal:** Deploy to production with live keys

**Steps:**
1. **Switch to Stripe live mode**
   ```bash
   # Get live keys from Stripe Dashboard
   railway variables set STRIPE_SECRET_KEY=sk_live_your_key
   railway variables set STRIPE_PUBLISHABLE_KEY=pk_live_your_key
   
   vercel env add VITE_STRIPE_PUBLISHABLE_KEY production
   # Enter: pk_live_your_key
   ```

2. **Deploy MUSD token to Mezo Mainnet**
3. **Update token address**
4. **Switch to mainnet RPC**
5. **Deploy and test**

**Expected Result:**
- ✅ Production-ready payment integration
- ✅ Real payments processing
- ✅ MUSD delivered to users

## Alternative: Mock Implementation (Temporary)

While waiting for Stripe Crypto Onramp approval, you can implement a mock/simulation mode:

### Option A: Mock Stripe Responses

Update `payment-service/src/services/onramp.service.ts`:

```typescript
async createSession(params: {
  walletAddress: string;
  destinationAmount?: string;
  sourceAmount?: string;
  sourceCurrency?: string;
  userId?: string;
}): Promise<{
  clientSecret: string;
  sessionId: string;
  url: string;
}> {
  // Check if in mock mode
  const MOCK_MODE = process.env.STRIPE_MOCK_MODE === 'true';
  
  if (MOCK_MODE) {
    // Return mock response
    const mockSession = {
      id: `mock_session_${Date.now()}`,
      client_secret: `mock_secret_${Date.now()}`,
      url: 'https://crypto.stripe.com/mock',
    };
    
    // Save to database with mock data
    const session = this.onrampSessionRepository.create({
      userId: user.id,
      stripeSessionId: mockSession.id,
      status: 'initialized',
      walletAddress: params.walletAddress,
      // ... other fields
    });
    
    await this.onrampSessionRepository.save(session);
    
    return {
      clientSecret: mockSession.client_secret,
      sessionId: session.id,
      url: mockSession.url,
    };
  }
  
  // Real Stripe implementation
  // ... existing code
}
```

Add to `.env`:
```bash
STRIPE_MOCK_MODE=true
```

### Option B: Use Stripe Test Mode with Different Product

Instead of Crypto Onramp, use regular Stripe Checkout temporarily:

```typescript
// Create regular checkout session
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'usd',
      product_data: {
        name: 'MUSD Token',
      },
      unit_amount: Math.round(parseFloat(sourceAmount) * 100),
    },
    quantity: 1,
  }],
  mode: 'payment',
  success_url: `${process.env.FRONTEND_URL}/success`,
  cancel_url: `${process.env.FRONTEND_URL}/cancel`,
});
```

This allows testing the payment flow without Crypto Onramp access.

## Summary

### Current State
- ❌ Error: "Failed to create onramp session"
- ❌ Placeholder API keys
- ❌ No Stripe Crypto Onramp access
- ✅ Code is correct and ready
- ✅ Architecture is sound

### After Deployment with Proper Config
- ✅ Real Stripe API keys configured
- ✅ Environment variables properly set
- ✅ Infrastructure deployed and running
- ⏳ Waiting for Stripe Crypto Onramp approval

### After Stripe Approval
- ✅ Complete working payment flow
- ✅ Users can buy MUSD with credit card
- ✅ MUSD delivered to wallets
- ✅ Production ready

## Action Items

### Immediate (Today)
1. ✅ Read `VERCEL_DEPLOYMENT.md` for deployment instructions
2. ✅ Get Stripe test API keys
3. ✅ Update local `.env` files with real keys
4. ✅ Request Stripe Crypto Onramp access
5. ✅ Test locally with real keys

### Short Term (This Week)
1. ✅ Deploy backend to Railway
2. ✅ Deploy frontend to Vercel
3. ✅ Configure all environment variables
4. ✅ Test staging deployment
5. ✅ Monitor for Stripe approval

### Medium Term (1-4 Weeks)
1. ⏳ Receive Stripe Crypto Onramp approval
2. ✅ Test complete payment flow
3. ✅ Fix any issues found in testing
4. ✅ Prepare for production launch

### Long Term (After Approval)
1. ✅ Deploy to production
2. ✅ Switch to live Stripe keys
3. ✅ Deploy MUSD to mainnet
4. ✅ Launch to users

## Conclusion

**Yes, deployment will resolve the error** - but only when combined with:
1. ✅ Real Stripe API keys (not placeholders)
2. ✅ Proper environment variable configuration
3. ⏳ Stripe Crypto Onramp access (pending approval)

The code is ready and correct. The error is purely a configuration/access issue that will be resolved through proper deployment and Stripe approval.

---

**Next Steps:**
1. Follow `VERCEL_DEPLOYMENT.md` for step-by-step deployment
2. Use `SPECTRUM_DEPLOYMENT.md` if you want enterprise-grade RPC
3. Check `TROUBLESHOOTING.md` for any issues during deployment

**Status:** Ready for Deployment
**Blocker:** Stripe Crypto Onramp Access (pending)
**Workaround:** Mock mode or regular Stripe Checkout (temporary)

