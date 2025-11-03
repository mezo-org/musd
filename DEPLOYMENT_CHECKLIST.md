# Deployment Checklist

## Pre-Deployment

### 1. Spectrum Nodes Setup
- [ ] Sign up at https://spectrumnodes.com/
- [ ] Choose plan (Developer for testing, Business for production)
- [ ] Add Mezo Testnet network
- [ ] Get RPC endpoint URL
- [ ] Get API key
- [ ] Test RPC connectivity

### 2. API Keys Configuration
- [ ] WalletConnect Project ID obtained
- [ ] Stripe test keys configured
- [ ] Spectrum API key configured
- [ ] All `.env` files updated
- [ ] Run `node verify-config.js` to verify

### 3. Code Preparation
- [ ] All TypeScript errors resolved
- [ ] All tests passing
- [ ] Build succeeds locally (`npm run build`)
- [ ] No console errors in browser
- [ ] Git branch up to date

## Frontend Deployment (dApp)

### Vercel Deployment
- [ ] Install Vercel CLI: `npm install -g vercel`
- [ ] Build locally: `cd dapp && npm run build`
- [ ] Deploy: `vercel --prod`
- [ ] Configure environment variables in Vercel dashboard
- [ ] Test deployed URL
- [ ] Verify wallet connection works
- [ ] Check Spectrum dashboard for RPC calls

### Environment Variables to Set
```
VITE_WALLETCONNECT_PROJECT_ID
VITE_MEZO_RPC_URL
VITE_MEZO_CHAIN_ID
VITE_MEZO_NETWORK
VITE_MUSD_TOKEN_ADDRESS
VITE_PAYMENT_SERVICE_URL
VITE_STRIPE_PUBLISHABLE_KEY
```

## Backend Deployment (Payment Service)

### Railway Deployment
- [ ] Install Railway CLI: `npm install -g @railway/cli`
- [ ] Initialize: `cd payment-service && railway init`
- [ ] Set environment variables
- [ ] Deploy: `railway up`
- [ ] Test health endpoint
- [ ] Verify Stripe webhooks configured

### Environment Variables to Set
```
NODE_ENV=production
PORT=3001
MEZO_RPC_URL
MEZO_CHAIN_ID
MEZO_NETWORK
SPECTRUM_API_KEY
MUSD_TOKEN_ADDRESS
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
DATABASE_URL
JWT_SECRET
CORS_ORIGIN
```

## Testing

### Smoke Tests
- [ ] Frontend loads without errors
- [ ] Backend health check responds
- [ ] RPC connectivity test passes
- [ ] No console errors

### Integration Tests
- [ ] Connect Bitcoin wallet
- [ ] View wallet balances
- [ ] Check MUSD balance
- [ ] Test "Buy MUSD" button
- [ ] Verify Spectrum metrics in dashboard

### Performance Tests
- [ ] Page load time < 3s
- [ ] RPC response time < 500ms
- [ ] No rate limit errors
- [ ] Wallet connection < 5s

## Monitoring Setup

### Spectrum Dashboard
- [ ] Enable real-time monitoring
- [ ] Set up RPS alerts
- [ ] Set up error rate alerts
- [ ] Set up latency alerts
- [ ] Set up credit usage alerts

### Application Monitoring
- [ ] Error tracking configured (Sentry)
- [ ] Log aggregation configured
- [ ] Uptime monitoring configured
- [ ] Performance monitoring configured

## Security

### Pre-Launch Security
- [ ] All API keys secured
- [ ] `.env` files not committed
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Webhook signatures verified
- [ ] SQL injection prevention verified
- [ ] XSS prevention verified

### SSL/TLS
- [ ] SSL certificate configured
- [ ] HTTPS enforced
- [ ] Security headers configured

## Documentation

- [ ] README.md updated
- [ ] API documentation complete
- [ ] Deployment guide reviewed
- [ ] Troubleshooting guide updated
- [ ] User guide created

## Post-Deployment

### Immediate (First Hour)
- [ ] Verify all services running
- [ ] Check error logs
- [ ] Monitor Spectrum dashboard
- [ ] Test complete user flow
- [ ] Verify Stripe webhooks working

### First Day
- [ ] Monitor error rates
- [ ] Check RPC usage patterns
- [ ] Review transaction logs
- [ ] Verify no security alerts
- [ ] Check performance metrics

### First Week
- [ ] Analyze usage patterns
- [ ] Optimize RPC calls if needed
- [ ] Review Spectrum credit usage
- [ ] Check for any issues
- [ ] Gather user feedback

## Production Readiness

### Before Mainnet Launch
- [ ] Switch to Mezo Mainnet RPC
- [ ] Deploy MUSD token to mainnet
- [ ] Update token address in config
- [ ] Switch Stripe to live mode
- [ ] Upgrade Spectrum to Business plan
- [ ] Configure production domains
- [ ] Security audit completed
- [ ] Load testing completed
- [ ] Disaster recovery plan in place
- [ ] Customer support ready

### Mainnet Configuration
```bash
# Update to mainnet values
VITE_MEZO_RPC_URL=https://mezo-mainnet.spectrumnodes.com/v1/YOUR_PROD_API_KEY
VITE_MEZO_NETWORK=mainnet
VITE_MUSD_TOKEN_ADDRESS=0xYourMainnetTokenAddress
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_SECRET_KEY=sk_live_your_key
```

## Rollback Plan

### If Issues Occur
- [ ] Rollback procedure documented
- [ ] Previous version tagged in git
- [ ] Database backup available
- [ ] Rollback tested in staging
- [ ] Team notified of rollback procedure

### Rollback Steps
1. Revert to previous git tag
2. Redeploy frontend
3. Redeploy backend
4. Verify services running
5. Test critical paths
6. Monitor for 1 hour

## Success Criteria

- [ ] Zero critical errors in first hour
- [ ] < 1% error rate
- [ ] < 2s average response time
- [ ] Wallet connection success rate > 95%
- [ ] Payment success rate > 98%
- [ ] Spectrum RPC uptime > 99.9%

## Team Communication

- [ ] Deployment schedule communicated
- [ ] On-call rotation established
- [ ] Incident response plan reviewed
- [ ] Contact list updated
- [ ] Slack/Discord channels configured

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Version**: _______________
**Status**: _______________

## Notes

_Add any deployment-specific notes here_

---

**Last Updated**: November 2, 2025
