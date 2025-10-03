---
marp: true
theme: gaia
class: lead
paginate: true
size: 16:9
backgroundColor: #fff
backgroundImage: url('https://marp.app/assets/hero-background.svg')
header: '**mUSD Hackathon**'
footer: '🚀 **Building on Mezo Bitcoin**'
style: |
  section {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }
  h1 {
    color: #1f2937;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 0.2em;
  }
  h2 {
    color: #374151;
  }
  strong {
    color: #1f2937;
  }
  code {
    background-color: #f3f4f6;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
  }
  pre {
    background-color: #1f2937;
    color: #f9fafb;
    padding: 1em;
    border-radius: 8px;
    margin: 1em 0;
  }
  ul li {
    margin: 0.3em 0;
  }
---

# mUSD: Building on Mezo Bitcoin

## A Developer's Guide to CDP Integration

**Objective**: High-level system overview + code integration patterns

![bg right:40%](placeholder-musd-logo.png)

---

# What is mUSD?

- **Stablecoin** minted by creating loans against crypto collateral
- **System Purpose**:
  - Borrowing against collateral
  - Maintain mUSD peg as stablecoin
- **Key User Actions**:
  - Opening, adjusting, and closing troves
  - Liquidation
  - Redemption

![bg right:30%](placeholder-system-overview.png)

---

# Contracts Overview

![bg right:45%](placeholder-architecture-diagram.png)

## Core Components
- **MUSD**: The stablecoin token contract
- **BorrowerOperations**: Basic borrower operations, interacts with TroveManager and asset pools
- **TroveManager**: Trove state + liquidations and redemptions logic
- **StabilityPool**: Handles liquidations

## Supporting Infrastructure
- **Asset Pools**: Track collateral and debt
- **HintHelpers and assorted functionality**

---

# Liquidation Economics

![bg right:35%](placeholder-liquidation-diagram.png)

- **Liquidator Incentives**: $200 MUSD gas compensation + 0.5% collateral profit
- **Stability Pool Incentives**: ~9% BTC discount on liquidations
- **Risk Management**: 110% liquidation threshold safety buffer
- **Speed Matters**: Fast liquidations prevent bad debt

---

# Redemption Arbitrage

![bg right:35%](placeholder-redemption-diagram.png)

- **Peg Maintenance**: Buy cheap mUSD, redeem for $1 BTC
- **Market Pressure**: Redemptions hit lowest-CR troves first

---

# Risk Management Deep Dive

![bg right:30%](placeholder-risk-diagram.png)

- **Borrower Risks**: Liquidation (10% loss), redemption (BTC upside loss), bad debt, depegging
- **System Controls**: minNetDebt (1800 MUSD minimum), Recovery Mode
- **Stress Scenarios**: Large liquidation rebalancing

---

# Interest Rate Mechanics

![bg right:30%](placeholder-interest-chart.png)

- **Simple vs Compound Interest**: MUSD uses simple linear interest
- **Rate Setting**: Set at trove creation based on global rate, kept for trove lifetime
- **Refinancing**: Costs percentage of borrowing to get new rate and capacity

---

# PCV Economics

![bg right:25%](placeholder-pcv-diagram.png)

- **Bootstrap Loan**: Why chosen over token incentives
- **Fee Distribution with Active Loan**:
  - Flow: fees → PCV → split (60% debt repayment, 40% fee recipient)
- **Fee Distribution when Loan Repaid**: 100% to fee recipient or stability pool
- **distributeMUSD()**: Manual governance process (weekly)
- **Fee Splits**: Governance controlled

---

# Developer Deep Dive: Pending Rewards

## Critical Integration Concept

```typescript
// ❌ WRONG - Only shows stored amounts
const storedDebt = await troveManager.getTroveDebt(userAddress)

// ✅ CORRECT - Includes pending rewards from redistributions
const [entireDebt, entireColl] = await troveManager.getEntireDebtAndColl(userAddress)

// Check if trove is active
const status = await troveManager.getTroveStatus(userAddress)
const isActive = status === 1
```

**Key**: Pending rewards auto-applied on next trove interaction

![bg right:30%](placeholder-pending-rewards.png)

---

# Developer Deep Dive: Hint Generation

## Gas Optimization: O(n) → O(1)

```typescript
// Calculate expected total debt (debt + fees + gas compensation)
const gasComp = await troveManager.MUSD_GAS_COMPENSATION()
const fee = await borrowerOperations.getBorrowingFee(debtAmount)
const totalDebt = debtAmount + fee + gasComp

// Generate hints for gas optimization
const nicr = (assetAmount * to1e18(100)) / totalDebt
const numTrials = (await sortedTroves.getSize()) * 15n

const { 0: approxHint } = await hintHelpers.getApproxHint(nicr, numTrials, 42)
const { 0: upperHint, 1: lowerHint } = await sortedTroves.findInsertPosition(
  nicr, approxHint, approxHint
)
```

**Critical**: Always generate fresh hints before transactions

![bg right:30%](placeholder-hint-generation.png)

---

# Developer Deep Dive: Integration Patterns & Best Practices

![bg right:35%](placeholder-integration-patterns.png)

- Reading Trove Data correctly
- Event Monitoring patterns
- Error Handling: Common revert conditions

---

# User Journey 1: Opening a Trove

## Core Concepts
- **ICR** (Individual), **TCR** (Total Collateralization Ratio)
- **Hints** for gas optimization
- **Gas compensation** automatically handled

```typescript
// Amount of MUSD to borrow and BTC collateral to deposit
const debtAmount = to1e18(2000)    // 2000 MUSD
const assetAmount = to1e18(10)     // 10 BTC

// Simple approach - no hints (higher gas cost)
const upperHint = ZERO_ADDRESS
const lowerHint = ZERO_ADDRESS

await borrowerOperations.openTrove(
  debtAmount,
  upperHint,
  lowerHint,
  { value: assetAmount }
)
```

![bg right:25%](placeholder-opening-trove.png)

---

# User Journey 2: Adjusting a Trove

## Code Demo

- **User Action**: Adjust collateral, repay debt, increase borrowing
- **Key Functions**:
  - adjustTrove function
  - Convenience functions: addColl, withdrawColl, repayMUSD, withdrawMUSD
  - TroveManager functions for fetching data
  - Refinancing: Moving to new interest rates

![bg right:25%](placeholder-adjusting-trove.png)

---

# User Journey 3: Closing a Trove

## Code Demo

- **User Action**: Repay all debt, withdraw collateral, close trove
- **closeTrove Function**:
  - Collateral returned to user
  - Paid mUSD burned from balance
  - Gas compensation burned from gas pool

![bg right:25%](placeholder-closing-trove.png)

---

# User Journey 4: Liquidation

## Code Demo

![bg right:30%](placeholder-liquidation-flow.png)

- **User Experience**: Liquidation when undercollateralized
- **liquidate Function**
- **Three Liquidation Scenarios**:
  - Stability Pool absorption (normal)
  - Partial liquidation (insufficient SP)
  - Full redistribution (empty pool)
- **StabilityPool**:
  - Deposit to earn liquidation rewards proportional to stake
  - Gas compensation incentives
  - Bootstrap loan seeds pool for stability
- **Impact on Other Borrowers**:
  - Automatic pending reward application
  - Developer implications

---

# User Journey 5: Redemption

## Code Demo

- **User Action**: Redeem mUSD for BTC collateral
- **Redemption Process**:
  - 1-1 mUSD exchange for collateral (minus fee)
  - Debt cancelled from active troves in ascending CR order
  - Collateral drawn from redeemed troves
- **Fee Structure**: 0.75% fee from collateral

![bg right:30%](placeholder-redemption-flow.png)

---

# Documentation Tour

![bg right:40%](placeholder-docs-screenshot.png)

- **README**: System overview, flow diagrams, economic model, liquidation scenarios
- **simpleInterest.md**: Interest calculation deep dive
- **Function Reference**: Contract interfaces
- **Event Reference**: Critical monitoring events
- **Test Files**: Integration examples

---

# Risk Management Tools You Can Build

![bg right:35%](placeholder-risk-tools.png)

- Liquidation risk dashboards with borrower warnings
- Redemption risk calculators
- System health monitoring (TCR, Recovery Mode alerts)

---

# Liquidation & Monitoring Tools You Can Build

![bg right:35%](placeholder-monitoring-tools.png)

- Liquidation bots with profit calculations
- Trove health monitoring dashboards
- Mobile liquidation risk alerts
- MEV-resistant liquidation strategies

---

# DeFi Integrations You Can Build

![bg right:35%](placeholder-defi-integrations.png)

- mUSD yield farming interfaces
- Automated trove rebalancing
- Arbitrage opportunity scanners

---

# Testing and Development Environment

![bg right:30%](placeholder-dev-environment.png)

- Local setup: Running contracts locally
- Test Networks: Available deployments
- Useful development commands

---

# Q&A and Resources

## Questions & Discussion

![bg right:35%](placeholder-qa.png)

**Summary**: mUSD CDP system on Mezo Bitcoin with developer-friendly integration patterns

**Resources**:
- Repository, documentation, Discord/community links

---

# Key Visuals Needed

- Architecture diagrams
- Economic flow diagrams (from README)
- Liquidation scenario flows
- Code examples for each user journey
- Integration pattern examples
- Documentation screenshots