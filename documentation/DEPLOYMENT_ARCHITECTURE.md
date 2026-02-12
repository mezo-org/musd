# Deployment Architecture

## Overview

This document provides visual diagrams of the MUSD Payment Integration deployment architecture.

## Current Local Development Setup

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer Machine                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Browser (localhost:5175)                            │  │
│  │  ┌────────────────┐      ┌────────────────────┐     │  │
│  │  │  React dApp    │      │  Bitcoin Wallet    │     │  │
│  │  │  (Vite)        │      │  Extension         │     │  │
│  │  └────────────────┘      └────────────────────┘     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Payment Service (localhost:3001)                    │  │
│  │  ┌────────────────┐      ┌────────────────────┐     │  │
│  │  │  Express API   │      │  SQLite Database   │     │  │
│  │  │  (Node.js)     │      │  (dev.sqlite)      │     │  │
│  │  └────────────────┘      └────────────────────┘     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  Stripe API    │  │  WalletConnect │  │  Mezo RPC    │  │
│  │  (Test Mode)   │  │  Cloud         │  │  (Testnet)   │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘

Current Issue: ❌ Stripe API keys are placeholders
                ❌ Stripe Crypto Onramp not enabled
```

## Deployed Architecture (Vercel + Railway)

```
┌─────────────────────────────────────────────────────────────┐
│                         Users                                │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  Chrome        │  │  Firefox       │  │  Brave       │  │
│  │  + Wallet      │  │  + Wallet      │  │  + Wallet    │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
└────────────┬────────────────────┬────────────────┬──────────┘
             │                    │                │
             └────────────────────┼────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                       │
│                  (Global CDN + SSL)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Static Assets (React Build)                         │  │
│  │  - HTML, CSS, JavaScript                             │  │
│  │  - Optimized and minified                            │  │
│  │  - Cached at edge locations                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  URL: https://your-app.vercel.app                           │
└────────────┬─────────────────────────────────────────────────┘
             │
             │ API Calls
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Railway Platform                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Payment Service (Node.js)                           │  │
│  │  ┌────────────────┐      ┌────────────────────┐     │  │
│  │  │  Express API   │      │  PostgreSQL        │     │  │
│  │  │  - REST API    │◄────►│  Database          │     │  │
│  │  │  - Webhooks    │      │  - Persistent      │     │  │
│  │  │  - Auth        │      │  - Backed up       │     │  │
│  │  └────────────────┘      └────────────────────┘     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  URL: https://musd-payment-service.railway.app              │
└────────────┬─────────────────────────────────────────────────┘
             │
             │ External API Calls
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  Stripe API    │  │  WalletConnect │  │  Mezo RPC    │  │
│  │  - Crypto      │  │  - Wallet      │  │  - Testnet   │  │
│  │    Onramp      │  │    Connection  │  │  - Mainnet   │  │
│  │  - Webhooks    │  │  - Cloud       │  │              │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘

Deployment Status: ✅ Infrastructure ready
                   ⏳ Waiting for Stripe Crypto Onramp access
```

## Enterprise Architecture (with Spectrum Nodes)

```
┌─────────────────────────────────────────────────────────────┐
│                         Users                                │
│                    (Global Distribution)                     │
└────────────┬────────────────────┬────────────────┬──────────┘
             │                    │                │
             └────────────────────┼────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                       │
│              (Multi-region, Auto-scaling)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Static Assets + Edge Functions                      │  │
│  │  - Cached globally                                    │  │
│  │  - SSL/TLS encryption                                 │  │
│  │  - DDoS protection                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Railway Platform                          │
│              (Auto-scaling, Load Balanced)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Payment Service Cluster                             │  │
│  │  ┌────────────────┐      ┌────────────────────┐     │  │
│  │  │  API Instances │      │  PostgreSQL        │     │  │
│  │  │  (Multiple)    │◄────►│  - Primary         │     │  │
│  │  │  - Health      │      │  - Replica         │     │  │
│  │  │    checks      │      │  - Automated       │     │  │
│  │  │  - Auto-scale  │      │    backups         │     │  │
│  │  └────────────────┘      └────────────────────┘     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  Stripe API    │  │  WalletConnect │  │  Spectrum    │  │
│  │  - Production  │  │  - Production  │  │  Nodes       │  │
│  │  - Live keys   │  │  - Project ID  │  │  - Private   │  │
│  │  - Webhooks    │  │                │  │    RPC       │  │
│  └────────────────┘  └────────────────┘  │  - 99.9% SLA │  │
│                                           │  - Multi-    │  │
│                                           │    region    │  │
│                                           │  - Monitoring│  │
│                                           └──────────────┘  │
│                                                   │          │
│                                                   ▼          │
│                                           ┌──────────────┐  │
│                                           │  Mezo        │  │
│                                           │  Network     │  │
│                                           │  - Mainnet   │  │
│                                           │  - MUSD      │  │
│                                           │    Contract  │  │
│                                           └──────────────┘  │
└─────────────────────────────────────────────────────────────┘

Production Status: ✅ Enterprise-grade infrastructure
                   ✅ 99.9% uptime SLA
                   ✅ Real-time monitoring
```

## Data Flow Diagram

### User Buys MUSD with Credit Card

```
┌──────────┐
│  User    │
│  Browser │
└────┬─────┘
     │
     │ 1. Click "Buy MUSD"
     │
     ▼
┌──────────────────┐
│  React dApp      │
│  (Vercel)        │
└────┬─────────────┘
     │
     │ 2. POST /api/v1/onramp/sessions
     │    { walletAddress, sourceAmount }
     │
     ▼
┌──────────────────┐
│  Payment Service │
│  (Railway)       │
└────┬─────────────┘
     │
     │ 3. Create Stripe Crypto Onramp Session
     │
     ▼
┌──────────────────┐
│  Stripe API      │
│  (Crypto Onramp) │
└────┬─────────────┘
     │
     │ 4. Return client_secret
     │
     ▼
┌──────────────────┐
│  Payment Service │
│  (Railway)       │
└────┬─────────────┘
     │
     │ 5. Save session to database
     │
     ▼
┌──────────────────┐
│  PostgreSQL      │
│  Database        │
└──────────────────┘
     │
     │ 6. Return session data
     │
     ▼
┌──────────────────┐
│  React dApp      │
│  (Vercel)        │
└────┬─────────────┘
     │
     │ 7. Load Stripe payment form
     │
     ▼
┌──────────┐
│  User    │
│  Browser │
└────┬─────┘
     │
     │ 8. Complete payment
     │
     ▼
┌──────────────────┐
│  Stripe          │
│  (Process        │
│   Payment)       │
└────┬─────────────┘
     │
     │ 9. Webhook: crypto_onramp_session.completed
     │
     ▼
┌──────────────────┐
│  Payment Service │
│  (Railway)       │
└────┬─────────────┘
     │
     │ 10. Update session status
     │
     ▼
┌──────────────────┐
│  PostgreSQL      │
│  Database        │
└──────────────────┘
     │
     │ 11. MUSD delivered to wallet
     │
     ▼
┌──────────────────┐
│  Mezo Network    │
│  (MUSD Contract) │
└──────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                           │
│                                                              │
│  Layer 1: Network Security                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - SSL/TLS encryption (HTTPS)                        │  │
│  │  - DDoS protection (Vercel/Railway)                  │  │
│  │  - Rate limiting (API endpoints)                     │  │
│  │  - CORS configuration                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Layer 2: Application Security                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Input validation                                  │  │
│  │  - SQL injection prevention (TypeORM)                │  │
│  │  - XSS prevention (React)                            │  │
│  │  - CSRF protection                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Layer 3: Authentication & Authorization                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - JWT tokens                                        │  │
│  │  - Wallet signature verification                     │  │
│  │  - API key authentication                            │  │
│  │  - Role-based access control                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Layer 4: Data Security                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Encrypted database connections                    │  │
│  │  - Environment variable encryption                   │  │
│  │  - Secure API key storage                            │  │
│  │  - Automated backups                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Layer 5: External Service Security                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Stripe webhook signature verification             │  │
│  │  - WalletConnect encryption                          │  │
│  │  - Mezo RPC authentication                           │  │
│  │  - API key rotation                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                          │
│                                                              │
│  Frontend Monitoring (Vercel)                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Page load times                                   │  │
│  │  - Error tracking                                    │  │
│  │  - User analytics                                    │  │
│  │  - Performance metrics                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Backend Monitoring (Railway)                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - API response times                                │  │
│  │  - Error rates                                       │  │
│  │  - CPU/Memory usage                                  │  │
│  │  - Database performance                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  RPC Monitoring (Spectrum - Optional)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Request per second (RPS)                          │  │
│  │  - Latency metrics                                   │  │
│  │  - Error rates                                       │  │
│  │  - Credit usage                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Payment Monitoring (Stripe)                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Transaction success rate                          │  │
│  │  - Payment volume                                    │  │
│  │  - Refund rate                                       │  │
│  │  - Dispute rate                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Alerting                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Email notifications                               │  │
│  │  - Slack/Discord webhooks                            │  │
│  │  - PagerDuty integration                             │  │
│  │  - Custom alert rules                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Scaling Strategy

### Horizontal Scaling

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Distribution                         │
│                                                              │
│  Low Traffic (< 100 RPS)                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend: 1 Vercel edge location                    │  │
│  │  Backend:  1 Railway instance                        │  │
│  │  Database: 1 PostgreSQL instance                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Medium Traffic (100-1000 RPS)                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend: Multiple Vercel edge locations            │  │
│  │  Backend:  2-3 Railway instances (auto-scaled)       │  │
│  │  Database: 1 Primary + 1 Read replica                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  High Traffic (> 1000 RPS)                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend: Global Vercel edge network                │  │
│  │  Backend:  5+ Railway instances (auto-scaled)        │  │
│  │  Database: 1 Primary + Multiple read replicas        │  │
│  │  Cache:    Redis for session/data caching            │  │
│  │  RPC:      Spectrum Nodes (dedicated infrastructure) │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Disaster Recovery

```
┌─────────────────────────────────────────────────────────────┐
│                    Backup Strategy                           │
│                                                              │
│  Database Backups                                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Automated daily backups                           │  │
│  │  - Point-in-time recovery                            │  │
│  │  - 30-day retention                                  │  │
│  │  - Encrypted backups                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Code Backups                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Git repository (GitHub)                           │  │
│  │  - Tagged releases                                   │  │
│  │  - Deployment history                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Configuration Backups                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Environment variables documented                  │  │
│  │  - Infrastructure as code                            │  │
│  │  - Deployment scripts                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Recovery Time Objective (RTO): < 1 hour                    │
│  Recovery Point Objective (RPO): < 24 hours                 │
└─────────────────────────────────────────────────────────────┘
```

## Cost Optimization

```
┌─────────────────────────────────────────────────────────────┐
│                    Cost Breakdown                            │
│                                                              │
│  Development/Testing                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Vercel:    $0/month (free tier)                     │  │
│  │  Railway:   $5/month (starter)                       │  │
│  │  Stripe:    $0/month (test mode)                     │  │
│  │  RPC:       $0/month (public)                        │  │
│  │  ─────────────────────────────                       │  │
│  │  Total:     $5/month                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Production (Standard)                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Vercel:    $20/month (Pro)                          │  │
│  │  Railway:   $20-50/month (usage-based)               │  │
│  │  Stripe:    2.9% + $0.30 per transaction             │  │
│  │  RPC:       $0/month (public)                        │  │
│  │  ─────────────────────────────────                   │  │
│  │  Total:     $40-70/month + transaction fees          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Production (Enterprise)                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Vercel:    $20/month (Pro)                          │  │
│  │  Railway:   $20-50/month (usage-based)               │  │
│  │  Stripe:    2.9% + $0.30 per transaction             │  │
│  │  Spectrum:  $169/month (Business plan)               │  │
│  │  ─────────────────────────────────                   │  │
│  │  Total:     $209-239/month + transaction fees        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Comparison

| Feature | Vercel + Railway | Spectrum Enterprise |
|---------|------------------|---------------------|
| **Setup Time** | 30-60 minutes | 1-2 hours |
| **Monthly Cost** | $40-70 | $209-239 |
| **RPC Uptime** | 95-99% | 99.9% SLA |
| **Rate Limits** | Moderate | High |
| **Monitoring** | Basic | Advanced |
| **Support** | Community | Priority |
| **Best For** | Most users | High-traffic production |

## Next Steps

1. **Review Architecture:** Understand the deployment structure
2. **Choose Deployment Path:** Vercel + Railway or Spectrum Enterprise
3. **Follow Deployment Guide:** `VERCEL_DEPLOYMENT.md` or `SPECTRUM_DEPLOYMENT.md`
4. **Configure Monitoring:** Set up alerts and dashboards
5. **Test Thoroughly:** Verify all components working
6. **Launch:** Deploy to production

---

**Last Updated:** November 2, 2025  
**Status:** Ready for Deployment
