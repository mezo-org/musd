---
marp: true
theme: default
paginate: true
size: 16:9
---

# How MUSD Works

---

# Overview

- **High level overview**
- **Code examples for common user interactions**
- **Critical integration concepts**
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

# Economic Model Overview

---

# Maintaining the Peg

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

# Liquidations

- **Under-collateralized troves (under 110% CR) are eligible for liquidation**
- **Public liquidate function can be called by anyone**
- **Liquidation rewards**
  - 200 MUSD flat fee
  - 0.5% of collateral
- **Stability Pool and redistribution**

---

# Redemptions

- **Anyone may call TroveManager.redeemCollateral to burn MUSD and receive BTC, $1 for $1 (minus the redemption fee)**
- **Trove with the lowest CR above 110% has an equivalent amount of debt cancelled, and that amount of BTC is transferred to the redeeming user**

- **Example:**
  - Alice has $10,000 of debt backed by $12,000 worth of BTC
  - Bob redeems $1000 worth of MUSD
  - Bob receives $1000 worth of Alice's BTC
  - Alice is now left with $9000 in debt backed by $11,000 of BTC

---

# Fees

- **Borrowing Rate: 0.1% added as debt to the loan**
- **Redemption Rate: 0.75% taken out of the collateral being redeemed**
- **Interest Rate: 1% fixed**
- **Refinancing Rate: 20% of the borrowing rate**

---

# Bootstrap loan

- **Stability Pool is initially populated with a bootstrap loan minted against future fees**
- **This can only leave the Stability Pool via liquidations until the debt is paid**
- **Fees collected by the protocol are used to pay down the bootstrap loan**

---

# PCV and Fee Distribution

- **Fees collected are sent to the PCV (Protocol Controlled Value) contract**
- **Governance can call a function to distribute the fees**
- **Until the bootstrap loan is paid, a portion of the fees are used to pay down the loan, with the remainder being sent to a specified fee recipient**

---

# Supporting Ideas

---

# Gas Compensation

- **When a user opens up a trove, an extra flat $200 MUSD is minted for gas compensation, sent to the GasPool, and added to the borrower's debt.**
- **This debt is included when calculating the user's collateralization ratio.**
- **When a trove is liquidated, the liquidator is sent the 200 MUSD as compensation**
- **In all other situations (redemption, closing a trove, repaying debt), the last 200 MUSD of debt is paid from the Gas Pool**
- **Effectively, this is a hold on 200 MUSD that is returned as long as a trove is not liquidated**

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

# Critical Integration Concepts

---

# Hint Generation

- **Problem: Troves in sorted list by CR, finding insertion point expensive**
- **Solution: Hints narrow search from O(n) to O(1) gas**

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

# Testing and Development Environment

---

# Questions

- **Resources**
  - Repository: https://github.com/mezo-org/musd
  - Developer Documentation: https://github.com/mezo-org/musd/blob/main/docs/README.md