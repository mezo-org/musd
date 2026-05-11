# Troubleshooting Guide - MUSD Payment Integration

## Common Issues and Solutions

### 1. Build Error: "Could not resolve 'sats-connect'"

**Error:**
```
ERROR: Could not resolve "sats-connect"
```

**Solution:**
```bash
cd dapp
npm install sats-connect --legacy-peer-deps
```

**Why:** The `@mezo-org/passport` package depends on `sats-connect` for Xverse wallet support, but it's not listed as a direct dependency.

---

### 2. Peer Dependency Conflicts

**Error:**
```
npm error ERESOLVE could not resolve
npm error peer viem@"2.22.8" from @mezo-org/passport@0.12.0
```

**Solution:**
Always use `--legacy-peer-deps` flag when installing packages:
```bash
npm install <package-name> --legacy-peer-deps
```

**Why:** `@mezo-org/passport@0.12.0` requires older versions of `viem` (2.22.8) and `wagmi` (2.5.12), but we're using newer versions (viem 2.21.0+, wagmi 2.12.0+). The app works fine with these version mismatches.

---

### 3. WalletConnect Not Working

**Symptoms:**
- "Connect Wallet" button doesn't work
- No wallet options appear

**Solution:**
1. Get a WalletConnect Project ID from https://cloud.walletconnect.com/
2. Update `dapp/.env`:
   ```
   VITE_WALLETCONNECT_PROJECT_ID=your_actual_project_id
   ```
3. Restart the dev server:
   ```bash
   npm run dev
   ```

---

### 4. Stripe Payment Errors

**Symptoms:**
- "Error: Failed to create onramp session" error (as shown in screenshot)
- 500 errors in payment service logs
- Alert dialog shows "localhost:5175 says: Error: Failed to create onramp session"

**Root Cause:**
The payment service is trying to call Stripe's Crypto Onramp API without proper configuration or access.

**Solutions:**

**Solution 1: Configure Stripe API Keys (Required)**
1. Get Stripe API keys from https://dashboard.stripe.com/test/apikeys
2. Update `payment-service/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_your_actual_key_here
   STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
   ```
3. Update `dapp/.env`:
   ```
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
   ```
4. Restart both services:
   ```bash
   # Terminal 1: Restart payment service
   cd payment-service
   npm run dev

   # Terminal 2: Restart dapp
   cd dapp
   npm run dev
   ```

**Solution 2: Request Stripe Crypto Onramp Access**
Stripe Crypto Onramp is currently in private beta:
1. Go to https://dashboard.stripe.com/
2. Navigate to "Crypto" section in the sidebar
3. Click "Request Access" for Crypto Onramp
4. Fill out the form explaining your use case
5. Wait for approval (can take a few days to weeks)

**Solution 3: Use Test Mode Until Approved**
While waiting for Stripe Crypto access, the payment service will show this error. This is expected behavior. Once deployed with proper Stripe configuration and Crypto Onramp access, the error will be resolved.

**Verification:**
After configuring Stripe keys, check the payment service logs:
```bash
cd payment-service
npm run dev
```

You should see:
```
[info]: Stripe initialized successfully
[info]: Server running on port 3001
```

Instead of:
```
[error]: Stripe configuration error
```

---

### 5. MUSD Balance Shows 0

**Symptoms:**
- Balance always shows "0 MUSD"
- No errors in console

**Possible Causes:**
1. **Token address not configured:**
   - Update `dapp/.env` with real MUSD token address:
     ```
     VITE_MUSD_TOKEN_ADDRESS=0xYourActualTokenAddress
     ```

2. **Wallet has no MUSD:**
   - This is expected if you haven't purchased MUSD yet
   - Try the "Buy MUSD" flow first

3. **Wrong network:**
   - Ensure you're connected to Matsnet
   - Check chain ID matches configuration

---

### 6. TypeScript Errors

**Error:**
```
Property 'address' does not exist on type...
```

**Solution:**
This should be fixed in the current version. If you see this:
1. Check that all files are up to date
2. Run `npm run build` to verify
3. Restart TypeScript server in your IDE

---

### 7. Port Already in Use

**Error:**
```
Port 5173 is in use, trying another one...
```

**Solution:**
This is normal - Vite will automatically try the next available port. Check the console output for the actual port:
```
➜  Local:   http://localhost:5175/
```

To use a specific port, update `dapp/vite.config.ts`:
```typescript
export default defineConfig({
  server: {
    port: 3000, // Your preferred port
  },
})
```

---

### 8. Bitcoin Wallet Not Connecting

**Symptoms:**
- Wallet extension installed but not detected
- Connection fails silently

**Solutions:**

**For Unisat:**
1. Ensure Unisat extension is installed and unlocked
2. Refresh the page
3. Try connecting again

**For OKX:**
1. Ensure OKX Wallet extension is installed
2. Make sure you're on the Bitcoin network in OKX
3. Refresh and retry

**For Xverse:**
1. Install Xverse browser extension
2. Create or import a wallet
3. Ensure it's unlocked
4. Refresh the page

---

### 9. Smart Account Not Created

**Symptoms:**
- Bitcoin wallet connects but no Matsnet address shown
- "Matsnet Smart Account" section is empty

**Solution:**
This is expected behavior - the smart account is created automatically by Mezo Passport when you connect your Bitcoin wallet. If you don't see it:
1. Check browser console for errors
2. Ensure WalletConnect is properly configured
3. Try disconnecting and reconnecting the wallet

---

### 10. Development Server Won't Start

**Error:**
```
Error: Cannot find module...
```

**Solution:**
1. Delete `node_modules` and reinstall:
   ```bash
   cd dapp
   rm -rf node_modules package-lock.json
   npm install --legacy-peer-deps
   ```

2. Clear Vite cache:
   ```bash
   rm -rf .vite
   npm run dev
   ```

---

## Debugging Tips

### Check Browser Console
Open DevTools (F12) and check the Console tab for errors:
- Red errors indicate problems
- Yellow warnings are usually safe to ignore

### Check Network Tab
1. Open DevTools → Network tab
2. Try the action that's failing
3. Look for failed requests (red)
4. Click on failed requests to see error details

### Check Payment Service Logs
The payment service logs are visible in the terminal where it's running:
```bash
# Look for errors like:
[error]: Failed to create onramp session
```

### Verify Environment Variables
```bash
# In dapp directory
cat .env

# In payment-service directory
cat .env
```

Make sure all required variables are set (not "your_key_here").

---

## Getting Help

If you're still stuck:

1. **Check the logs:**
   - Browser console (F12)
   - Payment service terminal
   - dApp dev server terminal

2. **Verify configuration:**
   - All API keys are real (not placeholders)
   - Services are running on correct ports
   - Environment variables are loaded (restart after changes)

3. **Try a clean install:**
   ```bash
   cd dapp
   rm -rf node_modules package-lock.json
   npm install --legacy-peer-deps
   npm run dev
   ```

4. **Check documentation:**
   - `MEZO_PASSPORT_INTEGRATION_COMPLETE.md`
   - `QUICK_START.md`
   - `docs/MEZO_PASSPORT_INTEGRATION.md`

---

## Quick Checklist

Before reporting an issue, verify:

- [ ] All dependencies installed with `--legacy-peer-deps`
- [ ] `sats-connect` package is installed
- [ ] WalletConnect Project ID is configured
- [ ] Stripe API keys are configured (both services)
- [ ] MUSD token address is configured
- [ ] Both services are running (payment-service and dapp)
- [ ] Browser console shows no errors
- [ ] Bitcoin wallet extension is installed and unlocked
- [ ] Environment variables are loaded (restart after changes)

---

## Version Information

**Working Configuration:**
- Node.js: v18+ or v20+
- npm: v9+ or v10+
- @mezo-org/passport: ^0.12.0
- wagmi: ^2.12.0
- viem: ^2.21.0
- sats-connect: ^4.2.1
- @rainbow-me/rainbowkit: 2.0.2

**Supported Wallets:**
- Unisat (Bitcoin)
- OKX Wallet (Bitcoin)
- Xverse (Bitcoin)

**Supported Browsers:**
- Chrome/Chromium (recommended)
- Firefox
- Brave
- Edge
