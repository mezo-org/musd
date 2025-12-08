# Reversible Call Option - Payoff Implementation

## Overview

This document explains how the `exercise()` function implements the reversible call option payoff mechanics from **Definition 1** in the paper "Mitigating DeFi Liquidations with Reversible Call Options" (arXiv:2303.15162).

## Definition 1: Reversible Call Option

A reversible call option is parameterized by:
- **Asset A**: The collateral (e.g., BTC)
- **N**: Amount of asset (e.g., 1.5 BTC)
- **K**: Strike price (debt amount that must be paid)
- **k**: Reimbursement factor (for early termination by seller)
- **T**: Time of maturity

### Timeline

1. **t₀ (Initialization)**:
   - Contract agreed between CB (buyer/supporter) and CS (seller/borrower)
   - Buyer CB pays premium φ to seller CS

2. **t₀ < t < T (Pre-Maturity)**:
   - Seller CS can terminate by reimbursing CB with φ·k (where k > 1)
   - This is the "reversible" aspect

3. **T (Maturity)**:
   - Buyer CB can acquire N units of asset A at strike price K
   - CB acts rationally to maximize profit

## Payoff Analysis for CB (Buyer/Supporter)

At maturity T, the payoff depends on whether CS terminated early:

### Case 1: Not Terminated (Option reaches maturity)

The payoff follows traditional European call option mechanics:

```
P_CB = {
    A(T) - K - φ    if A(T) ≥ K  (exercise is profitable)
    -φ              if A(T) < K  (option expires worthless)
}
```

Where:
- **A(T)**: Current value of N units of asset A at time T
- **K**: Strike price (amount CB must pay to acquire the asset)
- **φ**: Premium paid at t₀

### Case 2: Terminated Early

```
P_CB = φ·k - φ = φ(k - 1)
```

This is a constant profit for CB (since k > 1).

## Implementation in exercise()

### Step-by-Step Flow

```solidity
function exercise(address _borrower) external {
    // 1. VALIDATION
    // - Must be at maturity (t ≥ T)
    // - Must be in PreMaturity phase (not terminated)
    // - Only supporter (CB) can exercise
    
    // 2. GET CURRENT STATE AT T
    uint256 coll;              // N units of asset A
    uint256 collateralValue;   // A(T) = N × price
    uint256 strikePrice;       // K = principal + interest
    
    // 3. RATIONAL BEHAVIOR CHECK
    // Only exercise if A(T) ≥ K
    require(collateralValue >= strikePrice, "RCO: Exercise not profitable");
    
    // 4. PAYOFF CALCULATION
    // P_CB = A(T) - K - φ
    uint256 payoffBeforePremium = collateralValue - strikePrice;  // A(T) - K
    int256 netPayoff = payoffBeforePremium - premiumPaid;         // - φ
    
    // 5. EXECUTE OPTION
    // - CB pays K (burns mUSD)
    // - CB receives N units of asset A (collateral)
}
```

### Detailed Mechanics

#### Variables Mapping

| Paper Notation | Code Variable | Description |
|----------------|---------------|-------------|
| A | BTC (or other collateral) | Asset type |
| N | `coll` | Amount of collateral |
| K | `strikePrice` | Total debt (principal + interest) |
| A(T) | `collateralValue` | Current collateral value |
| φ | `option.premiumPaid` | Premium paid at t₀ |
| T | `option.maturityTime` | Maturity timestamp |
| CB | `msg.sender` (supporter) | Buyer of option |
| CS | `_borrower` | Seller of option |

#### Rational Behavior

The supporter only exercises if profitable:

```solidity
require(collateralValue >= strikePrice, "RCO: Exercise not profitable, A(T) < K");
```

This ensures CB acts rationally. If A(T) < K:
- Exercising would give: A(T) - K - φ < -φ (bigger loss)
- Not exercising gives: -φ (smaller loss, just premium)
- Rational choice: Don't exercise

#### Payoff Calculation

```solidity
// Payoff before considering premium: A(T) - K
uint256 payoffBeforePremium = collateralValue - strikePrice;

// Net payoff including premium paid at t₀: A(T) - K - φ
int256 netPayoff = int256(payoffBeforePremium) - int256(option.premiumPaid);
```

## Examples

### Example 1: Profitable Exercise

**At t₀:**
- Collateral: 1.5 BTC @ $30,000 = $45,000
- Debt: $35,000
- Premium φ: $3,000

**At T (maturity):**
- BTC price: $32,000
- A(T) = 1.5 × $32,000 = $48,000
- K = $35,500 (with interest)

**Decision:**
- A(T) = $48,000 ≥ K = $35,500 ✓ (profitable to exercise)

**Payoff:**
```
P_CB = A(T) - K - φ
     = $48,000 - $35,500 - $3,000
     = $9,500 profit
```

**Execution:**
1. Supporter pays $35,500 mUSD (burns it)
2. Receives 1.5 BTC worth $48,000
3. Net profit: $9,500

### Example 2: Unprofitable Exercise (Don't Exercise)

**At t₀:**
- Collateral: 1.5 BTC @ $30,000 = $45,000
- Debt: $35,000
- Premium φ: $3,000

**At T (maturity):**
- BTC price: $22,000 (crash!)
- A(T) = 1.5 × $22,000 = $33,000
- K = $35,500

**Decision:**
- A(T) = $33,000 < K = $35,500 ✗ (not profitable)

**If exercised (hypothetical):**
```
P_CB = A(T) - K - φ
     = $33,000 - $35,500 - $3,000
     = -$5,500 loss
```

**Rational choice: Don't exercise**
- Loss from not exercising: -$3,000 (just premium)
- Loss from exercising: -$5,500
- Better to lose only the premium

**Contract behavior:**
- `require(collateralValue >= strikePrice)` fails
- Transaction reverts
- Supporter keeps their mUSD, loses only premium

### Example 3: Early Termination by Borrower

**At t₀:**
- Premium φ: $3,000
- Reimbursement factor k: 1.2 (120%)

**At t (before T):**
- Borrower adds more collateral
- Wants to terminate option
- Pays: φ·k = $3,000 × 1.2 = $3,600

**Payoff for supporter:**
```
P_CB = φ·k - φ
     = $3,600 - $3,000
     = $600 profit (constant)
```

This is handled by the `terminateEarly()` function.

## Comparison with Traditional Call Option

| Aspect | Traditional Call | Reversible Call |
|--------|------------------|-----------------|
| Seller can terminate? | No | Yes (by paying φ·k) |
| Payoff at maturity | Same | Same |
| Payoff if terminated | N/A | φ(k-1) for buyer |
| Risk for buyer | -φ (premium loss) | φ(k-1) (profit from termination) |
| Risk for seller | Unlimited | Capped at φ·k |

## Key Implementation Details

### 1. Rational Exercise Check

```solidity
require(collateralValue >= strikePrice, "RCO: Exercise not profitable, A(T) < K");
```

This enforces rational behavior. The supporter cannot exercise if it would result in a worse outcome than letting the option expire.

### 2. Strike Price = Total Debt

```solidity
uint256 strikePrice = principal + interest;
```

In DeFi context:
- **K (strike price)** = Amount that must be paid to "acquire" the collateral
- This equals the total debt (principal + accrued interest)
- The supporter pays this to close the position and receive the collateral

### 3. Collateral Value Calculation

```solidity
uint256 collateralValue = (coll * price) / DECIMAL_PRECISION;
```

- **A(T)** = Current market value of N units of asset
- Uses oracle price at time T
- This is what the supporter will receive if they exercise

### 4. Net Payoff Tracking

```solidity
int256 netPayoff = int256(payoffBeforePremium) - int256(option.premiumPaid);
```

- Tracks the complete P&L including the premium paid at t₀
- Emitted in event for analytics
- Can be negative (loss) or positive (profit)

## Security Considerations

### 1. Oracle Price Manipulation

The payoff depends on `price` from oracle:
```solidity
uint256 price = priceFeed.fetchPrice();
```

**Risks:**
- Flash loan attacks to manipulate price
- Stale oracle data

**Mitigations:**
- Use TWAP (Time-Weighted Average Price)
- Multiple oracle sources
- Deviation checks

### 2. Front-Running

Supporter exercise can be front-run:
- Attacker sees exercise transaction in mempool
- If profitable, they can grief or extract MEV

**Mitigations:**
- Use private mempools (Flashbots)
- Commit-reveal schemes
- Time-locks

### 3. Integer Overflow/Underflow

```solidity
int256 netPayoff = int256(payoffBeforePremium) - int256(option.premiumPaid);
```

- Using Solidity 0.8.24 (built-in overflow checks)
- Explicit casting to `int256` for signed arithmetic
- Safe because we check `collateralValue >= strikePrice` first

## Testing Scenarios

### Happy Path Tests
- ✅ Exercise when A(T) > K (profitable)
- ✅ Exercise exactly when A(T) = K (breakeven)
- ✅ Correct payoff calculation
- ✅ Collateral transferred to supporter
- ✅ Debt paid off and trove closed

### Negative Tests
- ❌ Exercise when A(T) < K (should revert)
- ❌ Exercise before maturity (should revert)
- ❌ Exercise after termination (should revert)
- ❌ Exercise by non-supporter (should revert)
- ❌ Exercise with insufficient mUSD (should revert)

### Edge Cases
- Exactly at maturity timestamp
- Very small profit (dust amounts)
- Very large collateral values
- Price crash scenarios
- Multiple options on same borrower

## Gas Optimization Notes

The exercise function is gas-intensive because it:
1. Reads trove state
2. Burns mUSD
3. Updates ActivePool
4. Closes trove
5. Transfers collateral

**Optimization opportunities:**
- Batch exercise multiple options
- Use storage pointers efficiently
- Minimize external calls
- Cache frequently used values

## Conclusion

The `exercise()` function faithfully implements the reversible call option payoff mechanics from Definition 1:

1. ✅ Rational behavior: Only exercise if A(T) ≥ K
2. ✅ Correct payoff: P_CB = A(T) - K - φ
3. ✅ Atomic execution: Pay K, receive N units of A
4. ✅ Proper accounting: Debt paid, trove closed, collateral transferred

This creates a fair and efficient mechanism for backstop supporters to help borrowers avoid harsh liquidations while maintaining rational economic incentives.
