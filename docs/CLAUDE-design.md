# CLAUDE-design.md - System Design Documentation for AI Consumption

## Document Purpose

This document synthesizes all mUSD protocol documentation into a structured format optimized for AI assistant consumption. It provides comprehensive system understanding including architecture, mechanics, testing, and operational procedures.

---

## System Overview

### High-Level Description

mUSD is a decentralized stablecoin protocol for the Mezo network that allows Bitcoin holders to mint mUSD stablecoins through Collateralized Debt Positions (CDPs). The protocol maintains a $1 USD peg through arbitrage mechanisms, liquidations, and redemptions.

**Base Technology**: Fork of Threshold USD (which is itself a Liquity fork)

**Key Enhancements**:

- Fixed-rate borrowing with refinancing capabilities
- Protocol Controlled Value (PCV) for fee management
- EIP-712 signature verification for delegation
- Upgradeable contracts for flexibility
- Simple (non-compound) interest model

---

## Core Architecture

### Primary Components

#### 1. Custody Flow

**Entry Points**:

- `BorrowerOperations.openTrove` - User deposits BTC, receives MUSD
- BTC routed to `ActivePool` for custody

**Exit Points**:

- `BorrowerOperations.withdrawColl` - User withdrawal
- `BorrowerOperations.closeTrove` - Full debt repayment
- `TroveManager.redeemCollateral` - Redemption against trove
- `TroveManager.liquidate` - Liquidation event

**Redistribution Paths**:

- Liquidation via `StabilityPool` → BTC transferred to pool
- Liquidation via redistribution → BTC transferred to `DefaultPool`

#### 2. Price Peg Maintenance

**Price Floor ($1.00)**:

- Mechanism: Redemption arbitrage
- Process: MUSD trading below $1 → arbitrageurs redeem MUSD for BTC at $1 value → selling pressure on MUSD decreases supply → price recovers

**Example Arbitrage**:

```
MUSD = $0.80, BTC = $100k
1. Buy 1000 MUSD for $800
2. Redeem 1000 MUSD for 0.01 BTC ($1000 worth)
3. Sell 0.01 BTC for $1000
4. Profit: $200
```

**Price Ceiling ($1.10)**:

- Mechanism: 110% minimum collateralization ratio
- Process: MUSD trading above $1.10 → arbitrageurs open max-leveraged troves → MUSD supply increases → price falls

**Example Arbitrage**:

```
MUSD = $1.20, BTC = $100k
1. Buy 1 BTC for $100k
2. Open trove with 1 BTC, mint 90,909 MUSD (110% CR)
3. Sell 90,909 MUSD for $109,091
4. Profit: $9,091
```

#### 3. Fee Structure

**Fee Types**:

1. **Borrowing Rate**: 0.1% (governable) - added as debt, minted to governance
2. **Redemption Rate**: 0.75% (governable) - taken during BTC redemption
3. **Refinancing Rate**: Charged when updating interest rate
4. **Interest**: Simple, fixed-rate interest on principal

**Interest Rate Mechanics**:

- Global rate applies to new troves
- Once set, trove retains its rate until refinanced
- Changes to global rate don't affect existing troves
- Users can refinance to current global rate (with fee)

---

## Core Concepts & Definitions

### Trove (Collateralized Debt Position)

**Definition**: Individual position bound to one Ethereum address

**Components**:

- Active collateral: BTC amount recorded on trove struct
- Active principal: MUSD debt excluding interest
- Active interest: MUSD interest owed
- Active debt: Principal + interest
- Entire collateral: Active collateral + pending collateral rewards
- Entire debt: Active debt + pending debt from redistributions

### Collateralization Ratios

**Individual Collateral Ratio (ICR)**:

```
ICR = (Entire Collateral in USD at current price) / (Entire Debt)
```

**Nominal ICR (NICR)**:

```
NICR = (Entire Collateral in BTC * 100e18) / (Entire Debt)
```

Note: Used for sorted list positioning, excludes price oracle

**Total Collateralization Ratio (TCR)**:

```
TCR = (Entire System Collateral in USD) / (Entire System Debt)
```

**Critical Ratios**:

- Minimum CR (MCR): 110% - below this, troves are liquidatable
- Critical CR (CCR): 150% - when TCR falls below, system enters Recovery Mode

### System Modes

**Normal Mode** (TCR ≥ 150%):

- Standard operations allowed
- New troves require ≥110% CR
- Borrowing fees charged
- Users can close troves

**Recovery Mode** (TCR &lt; 150%):

- New troves require ≥150% CR
- No borrowing fees charged
- Trove closure disallowed
- Debt increases must improve trove CR AND result in ≥150% CR
- Refinancing disallowed

### Protocol Bootstrap Loan

**Purpose**: Seed Stability Pool without requiring external depositors

**Initial State**:

- 100M MUSD minted to PCV contract
- 100M MUSD deposited into Stability Pool
- Creates protocol-owned debt

**Repayment**:

- Fees and interest collected by PCV
- Portion used to burn MUSD (repaying loan)
- Once repaid, becomes Protocol Owned Liquidity (POL)

### Protocol Controlled Value (PCV)

**Role**: Fee management and bootstrap loan repayment

**Fee Distribution (with active bootstrap loan)**:

```
Fee split configurable by governance (example: 60% to loan, 40% to recipient)
- If feeRecipient set:
  - 60% → bootstrap loan repayment (up to outstanding amount)
  - 40% → feeRecipient
  - Excess → Stability Pool
- If feeRecipient not set:
  - 100% → bootstrap loan repayment
```

**Fee Distribution (after loan repaid)**:

```
- If feeRecipient set:
  - 60% → Stability Pool
  - 40% → feeRecipient
- If feeRecipient not set:
  - 100% → Stability Pool
```

---

## Core Operations

### Liquidations

**Trigger**: Trove ICR falls below 110%

**Execution**:

```solidity
TroveManager.liquidate(address _borrower)
TroveManager.batchLiquidateTroves(address[] _troveArray)
```

**Liquidator Rewards**:

- $200 MUSD gas compensation (from trove's gas reserve)
- 0.5% of liquidated collateral

**Liquidation Methods**:

#### Method 1: Stability Pool Liquidation (Preferred)

```
Conditions: Stability Pool has sufficient MUSD
Process:
1. Stability Pool burns MUSD to cover trove debt
2. Liquidator receives $200 MUSD + 0.5% BTC
3. Remaining 99.5% BTC sent to Stability Pool
4. BTC distributed proportionally to pool depositors
```

#### Method 2: Partial Stability Pool + Redistribution

```
Conditions: Stability Pool has insufficient MUSD
Process:
1. Stability Pool covers as much debt as possible
2. Remaining debt + collateral → DefaultPool
3. Redistributed proportionally to active troves by collateral stake
4. Recipients get $1.10 BTC per $1 debt (since liquidated at 110% CR)
```

#### Method 3: Full Redistribution

```
Conditions: Stability Pool empty
Process:
1. All debt + collateral → DefaultPool
2. Redistributed proportionally to active troves
3. Applied lazily when trove next interacts with system
```

**Impact on Recipients (Redistribution)**:

- Collateralization ratio decreases (but still net positive)
- Total debt obligation increases
- More MUSD required to close position in future
- No immediate financial harm (receive $1.10 value per $1 debt)

**Special Case**: Last trove in system cannot be liquidated (no redistribution targets)

### Redemptions

**Purpose**: Maintain price floor through arbitrage

**Mechanism**:

```solidity
TroveManager.redeemCollateral(
    uint _MUSDAmount,
    address _firstRedemptionHint,
    address _upperPartialRedemptionHint,
    address _lowerPartialRedemptionHint,
    uint _partialRedemptionHintNICR,
    uint _maxIterations
)
```

**Process**:

1. Burn MUSD tokens
2. Receive equivalent BTC value at $1 per MUSD (minus redemption fee)
3. Target troves in ascending CR order (lowest CR first)
4. Cancel equivalent debt from targeted troves
5. Extract equivalent BTC collateral

**Prerequisites**:

- TCR must be ≥ MCR
- Redeemer must have sufficient MUSD balance
- Redemption amount &gt; 0

**Partial Redemptions**:

- Trove debt reduced proportionally
- Trove collateral reduced proportionally
- Trove CR increases (less debt for given collateral)
- Trove re-inserted into sorted list
- Must leave trove with ≥ minimum debt (1800 MUSD)

**Full Redemptions**:

- Entire trove debt cancelled
- Trove closed
- Surplus collateral sent to `CollSurplusPool`
- Borrower can claim via `BorrowerOperations.claimCollateral`
- Gas compensation (200 MUSD) burnt

**Redemption Hints**:

```typescript
// Get hints for efficient redemption
const { firstRedemptionHint, partialRedemptionHintNICR, truncatedAmount } =
  await hintHelpers.getRedemptionHints(amount, price, maxIterations)

const { upperPartialRedemptionHint, lowerPartialRedemptionHint } =
  await sortedTroves.findInsertPosition(
    partialRedemptionHintNICR,
    address,
    address,
  )
```

**Example**:

```
Alice: $1000 debt, $1300 collateral (130% CR)
Bob: $1000 debt, $2000 collateral (200% CR)

Carol redeems $50:
- Alice's debt: $1000 → $950
- Alice's collateral: $1300 → $1250
- Alice's new CR: 132% (improved)
- Carol receives: $49.75 BTC (0.5% redemption fee)
- Protocol receives: $0.25 BTC fee
```

### Stability Pool

**Purpose**: Socialize liquidation losses, provide liquidation liquidity

**Mechanics**:

```
Deposits: Users deposit MUSD
Withdrawals: Users withdraw MUSD + accumulated BTC from liquidations
Share-based: Proportional ownership of pool assets
```

**Liquidation Economics**:

```
Example: $10,000 debt trove at 110% CR liquidated
- Stability Pool burns: $10,000 MUSD
- Stability Pool receives: $10,945 BTC (99.5% of $11,000 collateral)
- Discount: ~9% discount on BTC purchase
```

**Share Calculation**:

```
User deposits $5,000 into $20,000 pool → 5000 shares of 25000 total
After liquidation ($3000 debt, $3270 BTC seized):
- Pool has: $22,000 MUSD + $3270 BTC
- User withdraws: (5000/25000) * $22,000 = $4,400 MUSD
- User withdraws: (5000/25000) * $3270 = $654 BTC
```

**Bootstrap Loan Role**:

- PCV seeds pool with 100M MUSD (initially)
- Acts as permanent liquidity base
- Grows over time through fee collection
- BTC acquired via liquidations may be converted back to MUSD

### Gas Compensation

**Purpose**: Incentivize liquidations even during high gas prices

**Mechanism**:

```
On trove opening:
- Extra $200 MUSD minted
- Sent to GasPool
- Added to borrower's debt (included in CR calculations)

On liquidation:
- Liquidator receives $200 MUSD from GasPool
- Entire debt including gas compensation paid by Stability Pool

On redemption/closure:
- GasPool burns remaining $200 to pay off gas compensation debt
- User only needs to repay actual borrowed amount
```

**Example**:

```
Alice borrows $2000 MUSD with $3000 BTC collateral:
- Alice receives: $2000 MUSD
- GasPool receives: $200 MUSD
- Borrowing fee: $10 (0.5%)
- Alice's total debt: $2210 MUSD (for CR calculations)

If Alice closes trove:
- Alice pays: $2010 MUSD ($2000 + $10 fee)
- GasPool burns: $200 MUSD
```

### Recovery Mode

**Trigger**: TCR falls below 150%

**Operational Restrictions**:

- New troves require ≥150% CR (vs 110% in normal mode)
- No borrowing fees charged
- Cannot close troves
- Debt increases must:
  - Be paired with collateral increases
  - Improve the trove's CR
  - Result in trove CR ≥150%
- Cannot refinance troves

**Purpose**: Quickly restore system TCR above 150%

**Exit**: When TCR rises back above 150%

---

## Interest Rate System

### Simple Interest Model

**Characteristics**:

- Non-compounding (linear growth)
- Based on principal only
- Time-based calculation using timestamps

**Formula**:

```
Interest = Principal × Rate × (TimeElapsed / SecondsInYear)
```

**Example**:

```
Principal: $10,000
Rate: 3% APR
Year 1: $10,000 + $300 = $10,300
Year 2: $10,000 + $600 = $10,600 (not $10,609 as with compound)
```

### System-Level Interest Tracking

**State Variables**:

```solidity
uint256 interestNumerator;        // Aggregated interest rate
uint256 lastUpdateTimestamp;      // Last interest calculation
uint256 totalPrincipal;           // Sum of all trove principals
uint256 totalInterest;            // Sum of all accrued interest
```

**Update Process**:

```
1. Calculate new interest:
   newInterest = interestNumerator * (now - lastUpdate) / SECONDS_IN_YEAR
2. Add to total interest
3. Update timestamp
```

**When principal changes**:

```
interestNumerator = interestNumerator + (addedPrincipal * troveRate)
```

### Trove-Level Interest

**Per-Trove State**:

```solidity
struct Trove {
  uint256 principal; // Original borrowed amount
  uint256 storedInterest; // Previously accrued interest
  uint16 interestRate; // Fixed rate in basis points
  uint256 lastInterestUpdateTime; // Last calculation time
  uint256 maxBorrowingCapacity; // Max debt at 110% CR
}
```

**Calculating Current Interest**:

```
newInterest = principal * rate * (now - lastUpdate) / SECONDS_IN_YEAR
totalDebt = principal + storedInterest + newInterest
```

**On Trove Operations**:

1. Calculate newly accrued interest
2. Update system total interest
3. Add new interest to stored interest
4. Mint interest to PCV
5. Update lastInterestUpdateTime
6. Process operation (borrow, repay, etc.)

### Refinancing

**Purpose**: Allow users to update to new (presumably lower) interest rate

**Process**:

```solidity
BorrowerOperations.refinance()
```

**Effects**:

1. Calculate all accrued interest
2. Add interest to stored interest
3. Update interest rate to current global rate
4. Charge refinancing fee (% of issuance fee)
5. Update maxBorrowingCapacity if needed

**Fee**: Configurable percentage of issuance fee (typically 20%)

**When Required**: When approaching maxBorrowingCapacity limit

---

## Contract Architecture

### Core Contracts

#### BorrowerOperations

**Purpose**: Main user interface for trove management

**Key Functions**:

```solidity
// Trove lifecycle
openTrove(uint _debtAmount, address _upperHint, address _lowerHint) payable
closeTrove()
adjustTrove(uint _collWithdrawal, uint _debtChange, bool _isDebtIncrease, address _upperHint, address _lowerHint)

// Collateral management
addColl(address _upperHint, address _lowerHint) payable
withdrawColl(uint _amount, address _upperHint, address _lowerHint)

// Debt management
withdrawMUSD(uint _amount, address _upperHint, address _lowerHint)
repayMUSD(uint _amount, address _upperHint, address _lowerHint)

// Interest rate management
refinance()

// Surplus claims
claimCollateral(address _user)
```

**Requirements**:

- Upper/lower hints for sorted list insertion
- Operations must maintain ICR ≥ MCR (or CCR in recovery mode)
- Some operations require TCR ≥ CCR

#### TroveManager

**Purpose**: Handles liquidations, redemptions, and trove state

**Key Functions**:

```solidity
// Liquidations
liquidate(address _borrower)
batchLiquidateTroves(address[] _troveArray)

// Redemptions
redeemCollateral(
    uint _MUSDAmount,
    address _firstRedemptionHint,
    address _upperPartialRedemptionHint,
    address _lowerPartialRedemptionHint,
    uint _partialRedemptionHintNICR,
    uint _maxIterations
)

// View functions
getCurrentICR(address _user, uint _price)
getEntireDebtAndColl(address _borrower)
getPendingCollateral(address _borrower)
getPendingDebt(address _borrower)
getTCR()
checkRecoveryMode()
```

**Note**: Does NOT hold actual BTC/MUSD, only tracks state

#### StabilityPool

**Purpose**: Liquidation absorption and BTC distribution

**Key Functions**:

```solidity
provideToSP(uint _amount)  // Deposit MUSD
withdrawFromSP(uint _amount)  // Withdraw MUSD + BTC gains
```

**Internal**: Handles liquidation offsets, share calculations

#### InterestRateManager

**Purpose**: Interest rate calculations and governance

**Key Functions**:

```solidity
proposeInterestRate(uint _rate)
approveInterestRate()
getAccruedInterest()
```

**Note**: Rate changes don't affect existing troves

#### PCV (Protocol Controlled Value)

**Purpose**: Fee management and bootstrap loan

**Key Functions**:

```solidity
distributeMUSD(uint _amount)  // Distribute fees
depositToStabilityPool(uint _amount)
withdrawFromStabilityPool(uint _musdAmount)
withdrawMUSD(address _to, uint _amount)
withdrawCollateral(address _to, uint _amount)
```

**Governance Controls**: Fee split percentage, fee recipient

#### MUSD

**Purpose**: Stablecoin token

**Key Features**:

- ERC20 with EIP-2612 permit
- Mint list (authorized minters)
- Burn list (authorized burners)
- Governance controls for list management

#### SortedTroves

**Purpose**: Maintain ordered list of troves by NICR

**Structure**: Doubly-linked list

**Why**: Enables efficient:

- Liquidation targeting (lowest CR first)
- Redemption targeting (lowest CR first)
- Hint-based insertions (O(1) with hints vs O(n) without)

#### BorrowerOperationsSignatures

**Purpose**: Enable delegated trove operations via EIP-712 signatures

**Functions**: All main borrower operations with `WithSignature` suffix

**Use Case**: Allow smart contracts to manage troves on behalf of users

### Asset Pools

#### ActivePool

**Purpose**: Hold BTC collateral and track debt for active troves

**Tracks**:

```solidity
uint256 collateralBalance  // Total BTC in active troves
uint256 principal          // Total principal debt
uint256 interest           // Total accrued interest
```

#### DefaultPool

**Purpose**: Track redistributed debt and collateral

**Mechanism**: Per-unit-collateral reward snapshots

**Lazy Application**: Only applied when trove next interacts with system

#### CollSurplusPool

**Purpose**: Hold surplus collateral from full redemptions

**Claim**: Via `BorrowerOperations.claimCollateral()`

#### GasPool

**Purpose**: Hold gas compensation reserves

**Balance**: Sum of all $200 MUSD gas compensation amounts

### Supporting Contracts

#### PriceFeed

**Purpose**: Provide BTC/USD price data

**Important**: 60-second staleness check (reverts if not updated)

#### HintHelpers

**Purpose**: Calculate hints for sorted list operations

**Functions**:

```solidity
getApproxHint(uint _CR, uint _numTrials, uint _randomSeed)
getRedemptionHints(uint _amount, uint _price, uint _maxIterations)
```

#### GovernableVariables

**Purpose**: Manage governance parameters

**Controls**:

- Council/treasury roles (with time delays)
- Fee exemption list
- Role transitions

---

## Testing Framework

### Test Organization

**Structure**:

```
contracts/      - Core contracts
test/          - Test suites
helpers/       - Test utilities
scale-testing/ - Load testing framework
```

**Test Groups** (per test file):

```
1. Expected Reverts
2. Emitted Events
3. System State Changes
4. Individual Troves
5. Balance Changes
6. Fees
7. State Changes in Other Contracts
```

### Testing Best Practices

**Fixtures**:

```typescript
interface Contracts {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  musd: MUSD | MUSDTester
  troveManager: TroveManager | TroveManagerTester
  // ... other contracts
}

// Load cached test setup
cachedTestSetup = await loadFixture(fixture)
testSetup = { ...cachedTestSetup }
contracts = testSetup.contracts
```

**User State Tracking**:

```typescript
interface User {
  address: string
  wallet: HardhatEthersSigner
  btc: { before: bigint; after: bigint }
  musd: { before: bigint; after: bigint }
  trove: {
    collateral: { before: bigint; after: bigint }
    debt: { before: bigint; after: bigint }
    status: { before: bigint; after: bigint }
  }
  pending: {
    collateral: { before: bigint; after: bigint }
    debt: { before: bigint; after: bigint }
  }
}
```

**Helper Functions**:

```typescript
interface OpenTroveParams {
  musdAmount: string | bigint
  ICR?: string
  sender: HardhatEthersSigner
  upperHint?: string
  lowerHint?: string
}

await openTrove(contracts, {
  musdAmount: "10,000", // Accepts strings with commas
  sender: alice.wallet,
})
```

**Test Helpers**:

- Accept both bigint and string inputs
- Strings can include commas for readability
- Default values reduce boilerplate
- Mock contracts for state manipulation (PriceFeedTester, TroveManagerTester)

### Scale Testing

**Purpose**: Simulate real-world usage with multiple wallets and transactions

**Setup Process**:

```bash
# 1. Deploy contracts
pnpm run deploy --network matsnet_fuzz

# 2. Generate test wallets
npx hardhat run scripts/scale-testing/generate-wallets.ts --network matsnet_fuzz

# 3. Fund wallets
npx hardhat run scripts/scale-testing/fund-wallets.ts --network matsnet_fuzz

# 4. Initialize state tracking
npx hardhat run scripts/scale-testing/init-state-tracking.ts --network matsnet_fuzz

# 5. Run scenarios
npx hardhat run scripts/scale-testing/scenarios/open-troves.ts --network matsnet_fuzz
```

**Available Scenarios**:

- open-troves - Create initial troves
- add-collateral - Add BTC to existing troves
- withdraw-collateral - Remove BTC from troves
- increase-debt - Borrow more MUSD
- close-trove - Repay and close
- send-musd - Transfer between accounts
- redeem-musd - Redeem MUSD for BTC
- liquidate-troves - Trigger liquidations

**State Manager**:

```typescript
class StateManager {
    // Query accounts by criteria
    getAccounts({
        minMusdBalance?: string,
        hasTrove?: boolean,
        minCollateral?: string,
        notUsedInTest?: string
    })

    // Record actions
    recordAction(account, action, details)

    // Update state
    updateTroveState(account, troveData)
    updateBalances(account, balances)
}
```

**Results**: Saved to `./scale-testing/results/` as JSON with gas stats and outcomes

---

## Operational Procedures

### Stability Pool Rebalancing

**Purpose**: Maintain adequate MUSD liquidity for liquidations while managing BTC exposure

**When to Execute**:

- Monthly as scheduled maintenance
- When Stability Pool MUSD &lt; 80% of initial deposit
- When PCV's BTC holdings &gt; 20% of deposit value

**Process**:

1. **Detection** - Check PCV Stability Pool position

   ```
   StabilityPool.getCompoundedMUSDDeposit(PCV_ADDRESS)
   StabilityPool.getDepositorCollateralGain(PCV_ADDRESS)
   ```

2. **Withdraw BTC from Stability Pool**

   ```solidity
   pcv.withdrawFromStabilityPool(0)  // Withdraws all BTC, 0 MUSD
   ```

3. **Withdraw BTC from PCV**

   ```solidity
   pcv.withdrawCollateral(governanceAddress, btcAmount)
   ```

4. **Swap BTC for MUSD** - Execute on DEX

5. **Deposit MUSD to PCV**

   ```solidity
   musd.transfer(pcvAddress, musdAmount)
   ```

6. **Deposit to Stability Pool**

   ```solidity
   pcv.depositToStabilityPool(musdAmount)
   ```

7. **Verification** - Confirm balances restored

**Expected State After Rebalancing**:

- MUSD balance: ~15M
- BTC balance: ~0

**Risks**:

- BTC price volatility during swap
- Slippage on large swaps
- Execution risk (manual process)
- Governance delay for approvals

### Contract Migration

**Purpose**: Deploy new contract set while maintaining MUSD token

**Process**:

1. **Prepare New Contracts** - Same names OK in Solidity

2. **Create Deployment Scripts** - Start at `100_*.ts` to avoid conflicts

3. **Deploy New Contracts** - Skip MUSD and TokenDeployer (reuse existing)

4. **Set Addresses** - Configure new contracts with each other's addresses

5. **Update MUSD System Contracts**

   ```solidity
   MUSD.setSystemContracts(
       newTroveManager,
       newStabilityPool,
       newBorrowerOperations,
       newInterestRateManager
   )
   ```

6. **Initialize PCV Debt** - If creating new bootstrap loan

7. **Verify** - Check both old and new contracts in MUSD mint/burn lists

**Result**: Both old and new contract sets operational simultaneously

---

## Frontend Integration Guidelines

### Opening a Trove with Hints

**Challenge**: Finding insertion position in sorted trove list is expensive

**Solution**: Use hint system for O(1) insertion

**Process**:

```typescript
// 1. Calculate expected total debt
const debtAmount = to1e18(2000)
const gasCompensation = await troveManager.MUSD_GAS_COMPENSATION()
const expectedFee = await borrowerOperations.getBorrowingFee(debtAmount)
const expectedTotalDebt = debtAmount + expectedFee + gasCompensation

// 2. Calculate nominal ICR (no price)
const assetAmount = to1e18(10) // 10 BTC
const nicr = (assetAmount * to1e18(100)) / expectedTotalDebt

// 3. Get approximate hint
const numTroves = Number(await sortedTroves.getSize())
const numTrials = BigInt(Math.ceil(Math.sqrt(numTroves))) * 15n
const randomSeed = Math.ceil(Math.random() * 100000)

const { 0: approxHint } = await hintHelpers.getApproxHint(
  nicr,
  numTrials,
  randomSeed,
)

// 4. Get exact hints
const { 0: upperHint, 1: lowerHint } = await sortedTroves.findInsertPosition(
  nicr,
  approxHint,
  approxHint,
)

// 5. Open trove
await borrowerOperations.openTrove(debtAmount, upperHint, lowerHint, {
  value: assetAmount,
})
```

### Redemption with Hints

```typescript
// 1. Get redemption hints
const { firstRedemptionHint, partialRedemptionHintNICR, truncatedAmount } =
  await hintHelpers.getRedemptionHints(
    redemptionAmount,
    currentPrice,
    maxIterations,
  )

// 2. Get insert position hints
const { upperPartialRedemptionHint, lowerPartialRedemptionHint } =
  await sortedTroves.findInsertPosition(
    partialRedemptionHintNICR,
    redeemerAddress,
    redeemerAddress,
  )

// 3. Perform redemption
if (truncatedAmount > 0) {
  await troveManager.redeemCollateral(
    truncatedAmount,
    firstRedemptionHint,
    upperPartialRedemptionHint,
    lowerPartialRedemptionHint,
    partialRedemptionHintNICR,
    maxIterations,
  )
}
```

### Key API Changes (Recent Updates)

**BorrowerOperations**:

- Removed `_maxFeePercentage` parameter (fees now fixed)
- Removed `_assetAmount` parameter (uses `msg.value`)
- `refinance()` now requires hints
- New fee exemption checks via `GovernableVariables`

**TroveManager**:

- Virtual interest accrual in view functions
- Interest excluded from NICR calculations
- Redemption skips troves with ICR &lt; MCR
- `MIN_NET_DEBT` is now variable `minNetDebt`

**Events**:

- `TroveUpdated` now includes `interestRate` and `lastInterestUpdateTime`

### Fee Calculation

**Current Fee Structure**:

```typescript
// Borrowing fee (fixed)
const borrowingFee = await borrowerOperations.getBorrowingFee(debtAmount)

// Redemption fee (governance-controlled)
const redemptionFee =
  await borrowerOperations.getRedemptionRate(collateralAmount)

// Check if account is fee-exempt
const isFeeExempt = await governableVariables.isAccountFeeExempt(account)
```

**Fee Recipients**:

- Borrowing fees → PCV
- Redemption fees → PCV
- Interest → PCV (then distributed per governance rules)

---

## Key Differences from Liquity v1

### Fixed Interest Rates

- Liquity v1: No interest system
- mUSD: Fixed simple interest per trove, refinanceable

### Protocol Bootstrap

- Liquity v1: LQTY token incentives for Stability Pool deposits
- mUSD: Protocol bootstrap loan, no external incentives needed

### Upgradability

- Liquity v1: Immutable contracts
- mUSD: Upgradeable (OpenZeppelin proxy pattern), will be hardened later

### Fee Structure

- Liquity v1: Variable fees based on redemption activity
- mUSD: Fixed governable fees, simple interest

### Recovery Mode Liquidations

- Liquity v1: Special liquidation rules in recovery mode
- mUSD: Unified liquidation process (same in both modes)

### EIP-712 Signatures

- Liquity v1: Not supported
- mUSD: Full delegation support via BorrowerOperationsSignatures

---

## Risk Analysis

### For Borrowers

**1. Liquidation Risk**

- **Trigger**: ICR falls below 110%
- **Impact**: Up to 10% capital loss, potential tax implications
- **Mitigation**: Monitor position, add collateral proactively

**2. Redemption Risk**

- **Trigger**: MUSD trades below $1, arbitrageurs redeem
- **Target**: Lowest CR troves first
- **Impact**: Debt cancelled, collateral reduced proportionally, loss of BTC upside exposure, tax implications
- **Note**: Redemption improves your CR (less debt for collateral)

**3. Redistribution Risk** (when Stability Pool empty)

- **Impact**: Receive additional debt + collateral from liquidated troves
- **Net Effect**: Positive value ($1.10 BTC per $1 debt) but CR decreases
- **Consideration**: Requires more MUSD to close position

**4. Bad Debt Risk** (extreme price crashes)

- **Scenario**: Collateral value &lt; debt before liquidation
- **Probability**: Low due to:
  - Fast block times (quick liquidation)
  - Per-block oracle updates
  - 10% liquidation margin
  - Low friction liquidation (no capital required)

**5. Depeg Risk**

- **Scenario**: MUSD loses peg to $1
- **Impact**: Borrowed "dollars" worth less than expected
- **Mitigation**: Redemption mechanism maintains floor, arbitrage maintains ceiling

### For Stability Pool Depositors

**1. Impermanent Loss**

- **Mechanism**: MUSD burnt, BTC received at liquidation price
- **Risk**: BTC price continues falling after liquidation
- **Upside**: Purchased BTC at ~9% discount

**2. Liquidity Risk**

- **Bootstrap Loan**: Most liquidity initially from protocol
- **User Deposits**: No direct incentives (unlike Liquity v1)

---

## System Parameters

### Critical Constants

```solidity
// Collateralization
uint256 MCR = 110%                    // Minimum collateral ratio
uint256 CCR = 150%                    // Critical collateral ratio (recovery mode)
uint256 MIN_NET_DEBT = 1800 MUSD     // Minimum trove debt
uint256 MUSD_GAS_COMPENSATION = 200  // Gas compensation reserve

// Fees (governable)
uint256 BORROWING_FEE = 0.1%         // Issuance fee
uint256 REDEMPTION_FEE = 0.75%       // Redemption fee
uint256 REFINANCE_FEE = 0.02%        // 20% of issuance fee

// Interest
uint256 INTEREST_RATE                // Global rate, applies to new troves only
uint256 SECONDS_IN_YEAR = 31536000   // For interest calculations

// Liquidation
uint256 LIQUIDATION_REWARD = 0.5%    // % of collateral to liquidator
uint256 GAS_COMPENSATION = 200 MUSD  // To liquidator

// Protocol
uint256 BOOTSTRAP_LOAN = 100M MUSD   // Initial PCV loan (reduced to 15M post-launch)
```

### Governance Parameters

**Time Delays**:

- Interest rate changes: 7 days (proposal → approval)
- Borrowing/redemption rate changes: 7 days
- Role changes (council/treasury): Time-delayed
- Contract upgrades: Governance-controlled

**Fee Split** (PCV distribution):

- Configurable by governance
- Example: 60% to bootstrap loan repayment, 40% to fee recipient
- After loan repaid: 60% to Stability Pool, 40% to fee recipient

---

## Future Enhancements (RFC-1: Microloans)

**Status**: Proposed feature, not yet implemented

**Purpose**: Enable loans &lt; 1800 MUSD minimum (e.g., $25 minimum)

**Architecture**:

- Separate Microloans contract
- Opens main trove in MUSD system
- Provides sub-loans to users from main trove
- Higher minimum CR (e.g., 120% vs 110%)
- Interest rate = MUSD base rate + spread

**Key Concepts**:

```
Main Trove (opened by Microloans contract):
- Debt: 1,800+ MUSD
- Collateral: High CR (e.g., 300%)
- Fee exempt

User Microtroves (tracked by Microloans contract):
- Debt: As low as $25
- Collateral: 120%+ CR
- Higher interest rate
```

**Operations**:

- Users interact with Microloans contract
- Microloans adjusts main trove accordingly
- Liquidations pay down main trove debt
- Enables "promotion" to full MUSD trove

**Details**: See `docs/rfc/rfc-1.md` for complete specification with test vectors

---

## Deployment Information

### Network: Matsnet (Testnet)

```
ActivePool: 0x143A063F62340DA3A8bEA1C5642d18C6D0F7FF51
BorrowerOperations: 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5
BorrowerOperationsSignatures: 0xD757e3646AF370b15f32EB557F0F8380Df7D639e
CollSurplusPool: 0xB4C35747c26E4aB5F1a7CdC7E875B5946eFa6fa9
DefaultPool: 0x59851D252090283f9367c159f0C9036e75483300
GasPool: 0x8fa3EF45137C3AFF337e42f98023C1D7dd3666C0
GovernableVariables: 0x6552059B6eFc6aA4AE3ea45f28ED4D92acE020cD
HintHelpers: 0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6
InterestRateManager: 0xD4D6c36A592A2c5e86035A6bca1d57747a567f37
MUSD: 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
PCV: 0x4dDD70f4C603b6089c07875Be02fEdFD626b80Af
PriceFeed: 0x86bCF0841622a5dAC14A313a15f96A95421b9366
SortedTroves: 0x722E4D24FD6Ff8b0AC679450F3D91294607268fA
StabilityPool: 0x1CCA7E410eE41739792eA0A24e00349Dd247680e
TroveManager: 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0
```

---

## Changelog Summary

### v1.0.2 → Current

- TroveUpdated event includes interest rate and last update time

### v1.0.0 → v1.0.2

- Major contract interface changes
- GovernableVariables contract introduced
- Fee exemption system
- Borrowing/redemption rates now in BorrowerOperations
- MUSD governance simplified (immediate mint/burn list changes)
- Refinance requires hints

### v0.1.0 → v1.0.0

- Removed max fee percentage parameters
- Virtual interest accrual in view functions
- Interest excluded from NICR
- Unified liquidations (no special recovery mode rules)
- Fixed fee structure
- OwnableUpgradeable pattern

---

## Quick Reference: Common Operations

### Opening a Trove

```solidity
// Calculate hints first (see Frontend Integration section)
borrowerOperations.openTrove{value: btcAmount}(
    musdAmount,
    upperHint,
    lowerHint
)
```

### Adjusting a Trove

```solidity
borrowerOperations.adjustTrove(
    collWithdrawal,    // Amount of BTC to withdraw
    debtChange,        // Amount of debt to change
    isDebtIncrease,    // true = borrow more, false = repay
    upperHint,
    lowerHint
)
```

### Closing a Trove

```solidity
// Must have sufficient MUSD to repay debt (excluding gas compensation)
borrowerOperations.closeTrove()
```

### Liquidating

```solidity
// Single liquidation
troveManager.liquidate(borrowerAddress)

// Batch liquidation
troveManager.batchLiquidateTroves([address1, address2, ...])
```

### Redeeming

```solidity
// Calculate hints first (see Frontend Integration section)
troveManager.redeemCollateral(
    musdAmount,
    firstRedemptionHint,
    upperPartialRedemptionHint,
    lowerPartialRedemptionHint,
    partialRedemptionHintNICR,
    maxIterations
)
```

### Stability Pool

```solidity
// Deposit
stabilityPool.provideToSP(musdAmount)

// Withdraw
stabilityPool.withdrawFromSP(musdAmount)
```

### Checking System State

```solidity
// Individual trove
uint icr = troveManager.getCurrentICR(borrower, price)
(uint coll, uint debt) = troveManager.getEntireDebtAndColl(borrower)

// System-wide
uint tcr = troveManager.getTCR()
bool recoveryMode = troveManager.checkRecoveryMode()
```

---

## Glossary

**CDP**: Collateralized Debt Position, synonym for Trove

**CR**: Collateralization Ratio, ratio of collateral value to debt

**ICR**: Individual Collateralization Ratio, per-trove CR

**NICR**: Nominal ICR, collateral/debt ratio excluding price (used for sorting)

**TCR**: Total Collateralization Ratio, system-wide CR

**MCR**: Minimum Collateralization Ratio (110%)

**CCR**: Critical Collateralization Ratio (150%)

**PCV**: Protocol Controlled Value, contract managing fees and bootstrap loan

**POL**: Protocol Owned Liquidity, liquidity owned by protocol after bootstrap loan repaid

**Offset**: Cancelling debt with Stability Pool MUSD during liquidation

**Redistribution**: Distributing liquidated debt and collateral to active troves

**Pending Funds**: Debt and collateral from redistributions not yet applied to trove

**Gas Compensation**: 200 MUSD reserve per trove for liquidation incentive

**Collateral Surplus**: Excess collateral after full redemption, claimable by borrower

**Bootstrap Loan**: Initial protocol debt to seed Stability Pool

**Simple Interest**: Linear (non-compounding) interest calculation

**Refinance**: Updating trove to current global interest rate

**Recovery Mode**: System state when TCR &lt; 150%, with operational restrictions

**Hints**: Address parameters for efficient sorted list operations

---

## Document Maintenance

**Last Updated**: 2025-01-19

**Source Documents**:

- docs/README.md - Core architecture and mechanics
- docs/CHANGELOG.md - Version history and contract changes
- docs/migration.md - Migration procedures
- docs/scaleTesting.md - Scale testing framework
- docs/tests.md - Testing conventions
- docs/rebalancing.md - Operational procedures
- docs/simpleInterest.md - Interest system design
- docs/rfc/rfc-1.md - Microloans proposal

**Recommended Review Cycle**: Update when significant protocol changes occur

**Version**: Reflects system state as of v1.0.2 deployment
