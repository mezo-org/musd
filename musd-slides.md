# MUSD - Mezo Hackathon Presentation
## Bitcoin-Native Stablecoin Payment System

---

## Slide 1: Title Slide

# 💵 MUSD
## Bitcoin-Native Stablecoin on Mezo

**Enabling Bitcoin holders to transact with USD stability**

---

**Mezo Hackathon Submission**

🔗 GitHub: https://github.com/fapulito/musd  
🌐 Deployed on Vercel  
⚡ Powered by Mezo Passport

---

## Slide 2: The Problem

# 🚨 The Challenge

### Bitcoin holders face a critical dilemma:

**For Users:**
- 📉 Bitcoin's volatility makes everyday payments impractical
- 🔄 Converting to stablecoins means leaving the Bitcoin ecosystem
- 🔐 New wallets and seed phrases create friction and security risks
- 💸 High fees and slow settlement on traditional rails

**For Merchants:**
- 💰 Want Bitcoin exposure but need price stability
- ⏱️ Can't accept volatile assets for goods/services
- 🌍 Miss out on Bitcoin holder market (millions of users)
- 💳 Traditional payment processors charge 2-3% fees

### The Gap: No Bitcoin-native stablecoin solution exists

---

## Slide 3: Our Solution

# ✨ MUSD: The Solution

## Sign with Bitcoin, Transact with Stablecoins

### How It Works:

```
1. Connect Bitcoin Wallet
   └─> Via Mezo Passport (no new accounts!)

2. Mezo Creates Smart Account
   └─> Account abstraction on Matsnet

3. Sign with Bitcoin Wallet
   └─> User maintains custody & control

4. Smart Account Executes
   └─> MUSD transfers on Matsnet
```

### Key Innovation:
**MUSD- First Wallet-Native stablecoin Launched by a Self-Custodial Wallet**

---

## Slide 4: Technology Stack

# 🔧 Built with Mezo

## Deep Integration with Mezo Ecosystem

### Mezo Passport SDK (`@mezo-org/passport@0.12.0`)

```typescript
// Bitcoin wallet authentication
const { btcAddress, btcBalance } = useBitcoinAccount()

// Send MUSD with Bitcoin signature
const { sendTransaction } = useSendTransaction()
await sendTransaction(MUSD_TOKEN_ADDRESS, 0n, data)
```

### Tech Stack:
- **Blockchain:** Solidity smart contracts on Matsnet
- **Frontend:** React 19 + TypeScript + Vite
- **Integration:** Mezo Passport + Wagmi + Viem
- **Backend:** Node.js + Express payment service
- **Deployment:** Vercel + Railway

---

## Slide 5: Architecture

# 🏗️ System Architecture

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  👤 User's Bitcoin Wallet                      │
│     (Existing wallet - no new setup!)          │
│                                                 │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Signs transactions
                   ▼
┌─────────────────────────────────────────────────┐
│                                                 │
│  🔐 Mezo Passport SDK                          │
│     (Account abstraction layer)                │
│                                                 │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Creates & manages
                   ▼
┌─────────────────────────────────────────────────┐
│                                                 │
│  🎯 Smart Account (Matsnet)                    │
│     (Executes transactions on behalf of user)  │
│                                                 │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Executes ERC-20 transfers
                   ▼
┌─────────────────────────────────────────────────┐
│                                                 │
│  💵 MUSD Token Contract                        │
│     (ERC-20 stablecoin on Matsnet)            │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Result:** Bitcoin wallet controls USD-stable value seamlessly

---

## Slide 6: Key Features

# 🌟 What We Built

## For Users
- 🔐 **Bitcoin Wallet Auth** - Use existing wallet, no seed phrases
- 💰 **USD Stability** - Transact without volatility risk
- ⚡ **Instant Transfers** - Fast transactions on Matsnet
- 🔒 **Self-Custody** - Maintain control of your Bitcoin wallet
- 📱 **Simple UX** - Connect, send, done

## For Merchants
- 💵 **Stable Settlement** - Accept Bitcoin-backed payments in USD
- 🔌 **Easy Integration** - REST API and payment links
- 📊 **Real-Time Tracking** - Monitor transactions and balances
- 🌐 **Global Reach** - Access Bitcoin holder market
- 💸 **Low Fees** - Cheaper than traditional processors

## For Developers
- 📚 **Complete Docs** - Deployment guides and API docs
- 🛠️ **Modern Stack** - React, TypeScript, Mezo SDK
- 🧪 **Test Suite** - Comprehensive smart contract tests
- 🚀 **Easy Deploy** - One-click Vercel + Railway setup

---

## Slide 7: Hackathon Deliverables

# ✅ What We Delivered

## Complete Production-Ready System

### 1. Smart Contracts ✅
- ERC-20 MUSD token deployed on Matsnet
- Comprehensive Hardhat test suite
- Deployment scripts and documentation

### 2. React dApp ✅
- Mezo Passport integration (`useBitcoinAccount`, `useSendTransaction`)
- Custom hooks for wallet management (`useWalletInfo`, `useSendMUSD`)
- Responsive UI with Tailwind CSS
- Real-time balance tracking (Bitcoin + Matsnet)

### 3. Payment Service ✅
- Node.js + Express backend
- Transaction monitoring and webhooks
- Payment link generation
- Merchant API

### 4. Documentation ✅
- 📚 Complete deployment guides (Vercel, Railway, Boar, Spectrum)
- 🚀 Quick start guide (5-minute setup)
- 🐛 Troubleshooting documentation
- 📖 System architecture overview

### 5. Production Infrastructure ✅
- Vercel deployment configuration
- Railway backend hosting
- Environment management
- CI/CD ready

---

## Slide 8: Demo Flow

# 🎬 User Experience

## Step-by-Step Demo

### 1️⃣ Connect Wallet
```
User clicks "Connect Bitcoin Wallet"
→ Mezo Passport opens
→ User authenticates with existing Bitcoin wallet
→ No new accounts, no seed phrases!
```

### 2️⃣ View Balances
```
Dashboard shows:
→ Bitcoin wallet address & BTC balance
→ Matsnet smart account address
→ MUSD token balance
→ Real-time updates
```

### 3️⃣ Send MUSD
```
User enters:
→ Recipient address
→ Amount in MUSD
→ Clicks "Send"
```

### 4️⃣ Sign & Execute
```
→ Bitcoin wallet prompts for signature
→ User signs with Bitcoin wallet
→ Smart account executes transfer on Matsnet
→ Transaction confirmed in seconds
```

### 5️⃣ Merchant Receives
```
→ Merchant receives MUSD (USD-stable)
→ No volatility risk
→ Instant settlement
→ Lower fees than traditional processors
```

---

## Slide 9: Market Opportunity & Roadmap

# 📈 Growth Strategy

## Market Opportunity

### Target Market Size
- **Bitcoin Holders:** 50M+ globally with $1T+ market cap
- **E-commerce:** $5.7T global market (2023)
- **Stablecoin Market:** $150B+ and growing
- **Payment Processing:** $2T+ annual volume

### Our Niche
**Bitcoin holders who want to spend without volatility**  
**Merchants who want Bitcoin exposure with USD stability**

---

## Roadmap

### Q1 2025 - MVP Launch 🚀
- ✅ Matsnet deployment (DONE)
- ✅ Mezo Passport integration (DONE)
- 🔄 Production deployment (IN PROGRESS)
- 🎯 10-20 beta merchants
- 🎯 $10K transaction volume

### Q2 2025 - Mainnet & Growth 📊
- Deploy to Mezo mainnet
- 100+ merchants onboarded
- Payment plugins (WooCommerce, Shopify)
- Multi-currency (MEUR, MGBP)
- $100K monthly volume

### Q3 2025 - Scale 🌍
- Recurring payments & subscriptions
- Mobile app (React Native)
- Point-of-sale integrations
- 1,000+ merchants
- $1M monthly volume

### Q4 2025 - Enterprise 🏢
- Enterprise API
- Multi-signature support
- Compliance tools
- 10,000+ merchants
- $10M monthly volume

---

## Slide 10: Why MUSD Wins

# 🏆 Unique Value Proposition

## The First Bitcoin-Native Stablecoin

### What Makes Us Different

| Feature | Traditional Stablecoins | MUSD |
|---------|------------------------|------|
| **Wallet** | New Ethereum/other wallet | Existing Bitcoin wallet ✅ |
| **Seed Phrase** | New phrase to manage | No new phrases ✅ |
| **Ecosystem** | Leave Bitcoin | Stay in Bitcoin ✅ |
| **Signing** | Ethereum signature | Bitcoin signature ✅ |
| **Integration** | Complex setup | Mezo Passport ✅ |

### Key Advantages

1. **No Friction** - Use existing Bitcoin wallet, no new setup
2. **Bitcoin-Native** - Stay in the Bitcoin ecosystem
3. **Mezo-Powered** - Leverages cutting-edge account abstraction
4. **Production-Ready** - Complete system with docs and deployment
5. **Real Use Case** - Solves actual problems for users and merchants

### The Vision

**Enable Bitcoin to power the future of payments**

By combining Bitcoin's security and adoption with stablecoin's price stability, MUSD unlocks Bitcoin's potential as a medium of exchange.

---

## Thank You! 🙏

### MUSD - Bitcoin-Native Stablecoin on Mezo

**Built for the Mezo Hackathon**

---

📧 Contact: djanderson@duck.com  
🔗 GitHub: https://github.com/fapulito/musd  
🌐 Demo: https://musd.california.vision  
📚 Docs: https://github.com/fapulito/musd

---

**Questions?**

We're excited to discuss:
- Technical implementation details
- Mezo integration approach
- Market strategy and growth plans
- Partnership opportunities

---

*Built with ❤️ for the Mezo ecosystem*
