---
marp: true
theme: default
paginate: true
size: 16:9
---

# How MUSD Works

---

# Overview

- **System Overview**
- **Economic Model**
- **System Mechanics**
- **Code Examples**
- **Questions**

---

# What is MUSD?

- **MUSD is a stablecoin minted by creating loans against borrower's crypto assets**
- **What is the system solving?**
  - Borrowing against collateral
  - Maintain MUSD peg as stablecoin
- **Key User Actions:**
  - Opening, adjusting, and closing troves
  - Liquidation
  - Redemption

---

# System Overview

**Token**: MUSD

**Core Protocol**: BorrowerOperations, TroveManager, StabilityPool

**Asset Pools**: ActivePool, DefaultPool, CollSurplusPool, GasPool

**Supporting**: PriceFeed, SortedTroves, HintHelpers, InterestRateManager, PCV

---

# Maintaining the Peg

## Two mechanisms keep MUSD stable

**Liquidations** - Price ceiling via 110% minimum CR
- Under-collateralized troves eligible for liquidation
- Public liquidate function, anyone can call
- **Liquidation rewards**: 200 MUSD flat fee + 0.5% of collateral
- Stability Pool and redistribution

**Redemptions** - Price floor via $1-for-$1 exchange
- Anyone can burn MUSD and receive BTC at $1 value (minus 0.75% fee)
- Targets lowest CR troves above 110%

---

# Peg Arbitrage Examples

- **Price floor: $1-for-$1 redemptions**
  - MUSD trading for $0.80 on an exchange, BTC price $100k
  - Buy 1000 MUSD with $800
  - Redeem 1000 MUSD for 0.01 BTC
  - Sell 0.01 BTC for $1000

- **Price ceiling: 110% minimum collateralization ratio**
  - MUSD trading for $1.20 on an exchange
  - Buy 1 BTC for $100k
  - Open a loan with 1 BTC collateral and the maximum 90,909 MUSD as debt
  - Sell 90,909 MUSD for $109,091

---

# Custody

- **BTC collateral is held in the ActivePool**
- **MUSD is minted and sent to the borrower**
- **Collateral is released when:**
  - Debt is fully repaid
  - Trove is liquidated
  - Trove is redeemed against
  - User withdraws (if sufficiently collateralized)

---

# Fee Economics

**Fee Types:**
- **Borrowing Rate**: 0.1% added as debt to the loan
- **Redemption Rate**: 0.75% taken out of the collateral being redeemed
- **Interest Rate**: 1% fixed
- **Refinancing Rate**: 20% of the borrowing rate

**Bootstrap Loan & Distribution:**
- Stability Pool initially populated with bootstrap loan against future fees
- Fees → PCV → split between bootstrap loan repayment and fee recipients
- Once bootstrap loan paid, 100% fees go to recipients

---

# System Mechanics

---

# Gas Compensation

- **Opening a trove**: Extra 200 MUSD minted and added to your debt
- **Liquidation**: Liquidator receives the 200 MUSD as reward
- **All other actions**: 200 MUSD paid from GasPool, not your balance
- **Result**: 200 MUSD hold that's returned unless you get liquidated

---

# Recovery Mode

- **If the Total Collateralization Ratio (TCR) ever falls below the Critical Collateral Ratio (CCR) of 150%, we enter into Recovery Mode.**
- **RM restrictions:**
  - We require that newly opened troves have at least 150% CR, rather than the normal 110%.
  - We do not charge a borrowing fee.
  - User actions must increase their collateralization ratio.
    - Debt increases must be in combination with collateral increases such that the trove's collateral ratio improves.

---

# Pending Funds

- **Liquidations that exceed Stability Pool capacity get redistributed**
- **Your trove receives proportional share of liquidated debt and collateral**
- **Tracked as "pending" for gas efficiency - applied when you next use your trove**

---

# Critical Integration Concepts

---

# Hint Generation

- **Problem: Troves in sorted list by CR, finding insertion point expensive**
- **Solution: Hints narrow search**

---

# Pending Rewards

- **Remember that some debt and collateral may not be recorded on the trove struct until pending rewards are applied**
- **Check to make sure you are using the right functions to include pending rewards**
- **Wrong: getTroveDebt() (stored amounts only)**
- **Right: getEntireDebtAndColl() (includes pending)**

---

# Interest Accrual

- **Simple linear interest**
- **Set at trove creation based on global rate, kept for trove lifetime**
- **Interest is recorded on trove structs on user operation, similar to pending rewards**
- **Note some functions virtually accrue interest when needed**

---

# Opening a Trove

---

# Adjusting a Trove

---

# Closing a Trove

---

# Liquidation

---

# Redemption

---

# Testing and Development Environment

---

# Questions

- **Resources**
  - Repository: https://github.com/mezo-org/musd
  - Developer Documentation: https://github.com/mezo-org/musd/blob/main/docs/README.md