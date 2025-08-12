# RFC-1: Microloans

## Background

- MUSD's minimum loan size of 1800 excludes many users. Some may want to borrow smaller amounts to try out the system before taking out a larger loan, or they simply may not need to borrow that much MUSD.
- We are seeking to increase the overall MUSD volume by allowing users access to MUSD loans with a much smaller minimum (e.g. $25).
- As a secondary goal, keeping the user experience (at least the frontend) close to the MUSD/Borrow experience is valuable so that users can get a feeling for how the system works if they do choose to borrow more later. It's not critical that the systems be exactly 1 to 1, but if we can present them similarly, that is a plus.

## Current Functionality

MUSD has the following parameters:

- Minimum debt of 1800 MUSD
- 200 MUSD gas compensation added to initial debt that is refunded when the trove is closed. this is used as liquidation reward if the user is liquidated and is not actual debt in the usual sense.
- 0.1% issuance fee
- 0.02% refinance fee (calculated as 20% of the issuance fee)
- Maximum borrowing capacity set to the amount of debt that would create a 110% CR loan. This is set at the time of loan issuance and only increases when the loan is refinanced.
- Minimum collateralization ratio of 110%. Below this, troves are eligible for liquidation.
- Minimum system collateralization ratio of 150%. Below this, the system enters recovery mode, and no operations that would decrease trove CR (such as borrowing more) are allowed until the system leaves recovery mode.

The key functionality that is missing for microloans is the ability to borrow smaller amounts of MUSD. The current minimum debt of 1800 MUSD is too high for many users, and they may not need to borrow that much MUSD.

## Proposal

Create a new protocol, called Microloans, allowing users to borrow smaller amounts (for example, $25).  This will work
by having a separate contract that opens a trove in MUSD and uses that trove to provide MUSD to users.

### Goal

From a user perspective, the Microloans protocol should be similar to the MUSD/Borrow experience, but with a much lower minimum loan size. The goal is to allow users to try out the system with a smaller loan before committing to a larger one.

Most user actions available in MUSD/Borrow should be available in Microloans, such as:

- Opening a trove
- Closing a trove
- Repaying debt
- Borrowing more MUSD
- Adding more collateral
- Withdrawing collateral

Note that some of these actions may have requirements (such as minimum collateralization ratio) that are different from MUSD/Borrow, but the user experience should be similar.

Some user actions may not be available in Microloans, such as:

- Refinancing
- Redemption

Additionally, liquidations will work slightly differently in Microloans, although to a user the experience should be the same in terms of managing their liquidation risk.

### Implementation

#### Initial State

- The Microloans contract is added to the fee exempt array in MUSD.  This allows it to borrow MUSD without paying a fee.
- The Microloans contract takes out a loan from MUSD for the minimum amount (e.g. 1,800 MUSD) at an initial safe collateralization ratio (e.g. 300%).

#### Opening a Microloan

- A user wants to borrow a smaller amount (e.g. $25).
- The system accepts collateral from the user (e.g. $50 worth for a 200% CR loan).
**Note:** The collateral amount required to open a microloan must meet a minimum CR that is higher than the MUSD minimum (exact amount TBD).
- The system adds the collateral to its main trove and increases the main trove’s debt by the requested amount. 
- The system sends the borrowed MUSD to the user and creates a MicroTrove to track their collateral and debt.
- In addition to the amount borrowed, an issuance fee will be added to the user's initial debt.
- An ongoing fixed interest rate will be also be charged on the user's debt.
**Note:**A given address may only have one Microtrove at a time.  However, an address may have an MUSD trove and a Microtrove simultaneously.

#### Closing a Microloan

- A user wants to close their Microloan.
- The system accepts MUSD from the user equal to their debt including any interest accrued.
- This MUSD is used to decrease the debt in the main trove.
- The user's original collateral amount is withdrawn from the main trove.
- The user's collateral is sent back to the user and the MicroTrove is marked as Closed.

#### Adjusting a Microloan

Loan adjustments (adding or withdrawing collateral, increasing or decreasing debt) work much the same as opening or closing:
- Additional collateral is added to the main trove.
- Withdrawn collateral is sent to the user.
- Increasing debt causes the Microloans contract to borrow more MUSD and send it to the user.
- Decreasing debt pays down debt on the main trove.

Note that these actions are subject to some limitations due to CR constraints, to be discussed later.

#### Liquidations

- There will be a minimum collateralization ratio (CR) for microloans that is higher than the minimum for MUSD.  This is to
provide a buffer so that the microloans can be liquidated *before* the main trove is at risk of liquidation.
- If the user's CR falls below this threshold, the loan is eligible for liquidation.
- Once a loan is liquidated, the user's trove is marked as closed by liquidation, and they can no longer reclaim their collateral.

##### Liquidation Mechanism

There is a public `liquidate` function callable by anyone that can supply:
- A borrower address that is eligible for liquidation
- MUSD equal to the MicroTrove's debt

On calling `liquidate`:
- The MUSD from the caller is used to pay down the main trove's debt by the MicroTrove's debt amount
- The MicroTrove's collateral is sent to the caller.  Note this should be profitable for the caller as the trove is overcollateralized.
- For example if the user deposited $50 of collateral to borrow $25 and the value of the collateral drops to $28.75:
  - Caller provides $25 of collateral to `liquidate`
  - `liquidate` pays down the outstanding debt and sends $28.75 worth of collateral to the caller, netting a profit of $3.75.
- The user's trove is marked as closed by liquidation.

#### Minimum Collateralization Ratio Analysis

The minimum CR for microloans must provide sufficient buffer to ensure microloans can be liquidated before the main trove reaches MUSD's 110% liquidation threshold.

##### Buffer Logic

- MUSD liquidation threshold: 110% CR
- Proposed microloan liquidation threshold: 120% CR
- **10% buffer** between microloan liquidation and main trove risk

This 10% buffer mirrors MUSD's own design, where the 110% threshold provides a ~10% buffer above the point where liquidation becomes unprofitable (100% backing).

##### Buffer Adequacy Assessment

Historical data shows the fastest 10% BTC price drop (May 19, 2021) occurred over approximately 15 minutes, providing sufficient time for liquidation execution on 
Mezo's ~5-second block times.

##### Critical Execution Requirements
1. **Liquidation bot detection**: 1-2 blocks (~5-10s)
2. **Transaction confirmation**: 1-2 blocks (5-10s)
3. **MUSD acquisition**: Liquidator must obtain MUSD via swap or existing holdings
4. **Slippage management**: Large liquidations could impact MUSD/BTC prices

##### Risk Factors

**Conditions that could exhaust the 10% buffer:**
1. **Flash crashes**: Extreme volatility exceeding historical precedent
2. **Cascading liquidations**: Multiple protocols liquidating simultaneously
3. **MUSD liquidity constraints**: Insufficient liquidity for liquidation amounts
4. **Network congestion**: High gas prices or transaction delays during volatility

The 120% minimum CR provides a reasonable balance between user capital efficiency and system safety, assuming proper liquidation infrastructure and monitoring.

#### Interest Collection Mechanism

Microloans uses a simple interest approach similar to MUSD V2, with interest calculated linearly on the principal debt amount (no compounding). 
Interest rates are set as a spread over the MUSD base rate and adjust automatically when MUSD rates change.  This is because the main trove is
subject to MUSD interest rates and must call `refinance` at times to increase its `maxBorrowingCapacity`.

##### Interest Rate Management

The microloan interest rate is calculated as:
```
microloanRate = musdBaseRate + spread
```

Where the spread compensates for operational complexity and smaller loan sizes (e.g., 4% spread).

Global rate history is maintained to handle rate changes:
- `currentRate`: Current microloan interest rate
- `rateHistory[]`: Array of historical rate changes with timestamps
- When MUSD rates change, a new entry is added to `rateHistory` and `currentRate` is updated

##### Individual MicroTrove Data

Each MicroTrove stores:
- `principalDebt`: Original borrowed amount plus any additional borrowing
- `storedInterest`: Previously accrued but unpaid interest
- `lastUpdateTimestamp`: Timestamp of last interest calculation

##### Interest Calculation

Interest is calculated by iterating through rate periods since the last update:

```
totalInterest = 0
periodStart = lastUpdateTimestamp

for each rate change after lastUpdateTimestamp:
    periodEnd = rateChange.timestamp
    rate = previous rate (or initial rate for first period)
    periodInterest = principalDebt * rate * (periodEnd - periodStart) / secondsInYear
    totalInterest += periodInterest
    periodStart = periodEnd

// Final period at current rate
finalInterest = principalDebt * currentRate * (currentTimestamp - periodStart) / secondsInYear
totalInterest += finalInterest

totalDebt = principalDebt + storedInterest + totalInterest
```

##### Interest Updates

Interest is recalculated and stored during:
- Any loan operation (borrow, repay, adjust collateral, etc.)
- Liquidation events
- Loan closure
- Rate changes (optional optimization)

The update process:
1. Calculate `newInterest` using the rate period formula above
2. Add `newInterest` to `storedInterest`
3. Update `lastUpdateTimestamp` to current time
4. Use `totalDebt` for all CR and liquidation calculations

##### Rate Change Process

When MUSD rates change:
1. Calculate new microloan rate: `newRate = newMUSDRate + spread`
2. Add entry to `rateHistory`: `{rate: currentRate, timestamp: block.timestamp}`
3. Update `currentRate` to `newRate`
4. All subsequent interest calculations will use the new rate structure

##### Repayment Priority

When users repay debt, payments are applied in order:
1. First to accumulated interest (`storedInterest + newInterest`)
2. Then to principal debt

##### System-Level Tracking

For system CR calculations, the contract maintains:
- `totalMicroloanPrincipal`: Sum of all active microloan principal debt
- `totalStoredInterest`: Sum of all previously accrued interest
- `lastSystemUpdate`: Timestamp of last system-wide interest update

System CR = (mainTroveCollateral) / (mainTroveDebt + totalMicroloanPrincipal + totalStoredInterest + calculatedNewInterest)

**Note**: This will be missing some interest that has yet to be accrued, but it should give a *close enough* CR while avoiding extra complexity.

#### Fee Management

Fees collected from microloans (including issuance fees and interest payments) are accumulated in the contract's MUSD balance and tracked for transparency and future governance decisions.

##### Fee Tracking

The contract maintains detailed accounting of fees collected:

```solidity
uint256 public totalFeesCollected;        // Total MUSD accumulated from all fees
uint256 public totalInterestCollected;    // MUSD from interest payments
uint256 public totalIssuanceFeesCollected; // MUSD from issuance fees
```

##### Fee Collection Process

When fees are collected:
1. **Interest payments**: When users pay interest or close loans, interest amounts are added to `totalInterestCollected` and `totalFeesCollected`
2. **Issuance fees**: When users open loans or increase debt, issuance fees are added to `totalIssuanceFeesCollected` and `totalFeesCollected`
3. **Balance management**: All fees remain in the contract's MUSD balance, providing operational flexibility

##### Future Fee Utilization

The initial implementation focuses on fee accumulation and tracking. Future governance decisions may implement fee utilization mechanisms such as:

- **Fee withdrawal**: Allow governance to withdraw accumulated fees to a treasury or other designated addresses
- **Fee reinvestment**: Use accumulated fees to strengthen the main trove by adding collateral or paying down debt
- **Fee distribution**: Distribute fees to stakeholders according to governance-defined criteria
- **Protocol development**: Use fees to fund ongoing development and maintenance

This approach provides maximum flexibility while maintaining full transparency of fee collection and system profitability.

#### Promotions

We will allow for users to "promote" their microloans to full MUSD troves.  This will allow for users to test the waters
with microloans and then seamlessly upgrade without losing their position.  

For example, say a user has a microtrove with $50 in debt and $100 worth of collateral. They show up with $2900 worth of
collateral (picked so that their promoted trove is at 150% CR with minimum debt, this could be any other amount that results
in a valid MUSD trove) and want to "promote" their microtrove to a $2000 MUSD trove:

- Contract accepts the $2900 of collateral and withdraws the user's $100 of collateral from its trove.
- Contract calls openTroveWithSignature with the borrower as the _borrower parameter and itself as the _recipient.
- Contract receives 2000 MUSD, uses 50 of it to decrease its debt (from the microtrove) and sends the remaining 1950 to the user.
- The user now has their desired position: 2000 in MUSD debt (plus some fees) backed by 3k of collateral.

#### Governance

The Microloans protocol should adopt a governance structure similar to MUSD's three-tier model, adapted for the specific needs of microloans management.

##### Proposed Three-Tier Structure

**1. Owner (Bootstrap Phase)**
- **Purpose**: Contract deployment and initial setup
- **Powers**: 
  - Initialize contracts and set addresses
  - Set initial council/treasury roles  
  - Configure fee exemption for Microloans contract in MUSD
  - **Self-destruct**: Renounce ownership after setup completion
- **Duration**: Temporary (renounced after deployment)

**2. Council (Primary Governance)**
- **Purpose**: Protocol parameter management and routine operations
- **Powers**:
  - Parameter management (interest rates, CRs, fees) with time delays
  - Emergency pause/unpause operations
  - Fee collection and utilization decisions
  - Main trove management (e.g. collateral adjustments)
  - Liquidation bot configuration and monitoring
- **Implementation**: Multi-sig wallet

**3. Treasury (Financial Operations)**  
- **Purpose**: Financial management and emergency response
- **Powers**:
  - Emergency collateral provision for undercollateralization events
  - Fee withdrawal and treasury management  
  - Emergency funding for system recapitalization
  - Protocol revenue distribution decisions
- **Implementation**: Separate multi-sig wallet from Council

##### Security Mechanisms

**Time Delays (7-day standard)**:
```solidity
// Parameter changes require propose-approve pattern
function proposeInterestRateSpread(uint256 _spread) external onlyGovernance
function approveInterestRateSpread() external onlyGovernance // 7-day delay

function proposeMinimumCR(uint256 _mcr) external onlyGovernance  
function approveMinimumCR() external onlyGovernance // 7-day delay
```

**Emergency Powers (Immediate execution)**:
```solidity
function emergencyPause() external onlyGovernance // No delay for critical situations
function addEmergencyCollateral(uint256 _amount) external onlyTreasury // No delay
```

**Progressive Permissions**:
- **Routine operations**: Require Council OR Treasury (`onlyGovernance`)
- **Financial operations**: Treasury-specific functions for fund management
- **Emergency responses**: Immediate execution for critical system protection

#### Monitoring and Alerting

##### Key Metrics to Monitor

###### System Health Metrics
- Main trove CR (alert if < 200%)
- Total system CR
- Number of active microloans
- Total outstanding microloan debt
- Available borrowing capacity remaining

###### Risk Metrics
- Number of microloans near liquidation threshold (120% CR)
- Price volatility indicators
- Liquidation profitability margins (gas cost vs. reward)

###### Operational Metrics
- Failed liquidation attempts
- Oracle price feed health

##### Critical Alerts

###### Immediate Action Required
- Main trove CR drops below 150%
- Oracle price feed failure or stale data
- Liquidation bot errors / downtime

### Limitations

#### Collateralization, Liquidation Buffer, and Catastrophic Scenarios

- As the price of collateral falls, individual microloans get liquidated when they drop below the minimum CR (e.g. 115%, providing a 5% buffer over MUSD’s 110% minimum). This buffer is intended to allow the system to sell the user’s collateral and cover the corresponding debt before the main trove is jeopardized.
- In scenarios where there is a highly overcollateralized main trove with a number of lower CR microloans, the liquidation of these lower CR microloans helps to keep the main trove healthy by continuously paying down its debt.
- This setup works except in a scenario where the initial $2,000 loan itself is at risk of liquidation, and it is the main factor pulling down the average CR.
- To mitigate catastrophic scenarios, one approach is to initially open the $2,000 loan with a high collateralization ratio (for example, 500%). This provides a buffer, so that even if the price drops severely (e.g. to 20% of its original value), the main trove is still protected up to that point.
- By also imposing a maximum on the collateralization ratio of microloans (equal or less than the main trove’s current CR), it would prevent microloans from ever being more overcollateralized than the main trove. This would in theory ensure that there cannot be a situation where the pool is wiped out due to a single main trove liquidation while some microloans are fully collateralized.

**Note:** It is still possible for the main trove to be liquidated.  All microloans up to that point should be liquidated by then, but for the system to continue functioning the main trove would need to be reopened.

**Main Trove Liquidation Response**

If the main trove gets liquidated, the system faces a critical failure state requiring immediate intervention:

1. **Automatic System Pause**: System automatically pauses all operations when main trove liquidation is detected
2. **Governance Recapitalization**: Requires emergency governance action to add new collateral backing
3. **System Reset**: Before unpausing, governance must ensure adequate collateral coverage for all user claims

#### Fee Exemption and Maximum Borrowing Capacity

As mentioned earlier, MUSD sets a maximum borrowing capacity set to the amount of debt that would create a 110% CR loan. 
This is set at the time of loan issuance and only increases when the loan is refinanced.  Because the Microloans contract
will need to frequently increase its debt, it may need to call `refinance` at times in order to increase its maximum borrowing capacity.
Normally, this would come with a fee charged on the entire debt of the trove.  This would result in an unfair fee being
passed on to Microloans users, so the simplest solution is to make the Microloans contract fee exempt in MUSD.  This means it will
not pay a fee for borrowing or refinancing which makes dynamically sizing its trove much cheaper and simpler.

#### Recovery Mode

When the total system collateralization ratio (TCR) of MUSD falls below 150%, the system enters recovery mode.  This limits
trove operations to only those that would improve the TCR (such as adding collateral).  Actions that would reduce the TCR
(like borrowing more MUSD) are not allowed until the system leaves recovery mode.  

More specifically, only the following adjustments are allowed:
- Collateral increase
- Debt repayment
- Collateral increase with debt repayment
- Debt increase combined with a collateral increase that leaves the trove's CR >= 150% and improves the trove's CR

To account for this, the Microloans protocol would also need to have a recovery mode with the same restrictions as it will not be able to adjust its trove
to offset user actions.

#### Redemption Risk Management

The MUSD system allows users to redeem MUSD tokens for BTC at $1 worth of BTC per MUSD (minus redemption fees). Redemptions target troves in ascending collateralization ratio order, reducing both debt and collateral proportionally from each targeted trove. This poses a significant risk to the Microloans system if the main trove is redeemed against.

##### The Redemption Risk

Redemptions against the main trove affect its collateral balance, potentially creating a situation where there is not enough collateral to back existing users' microloans.

There are two main cases: full redemptions and partial redemptions.

A partial redemption is when the redemption amount does not full consume the debt of the trove, allowing the trove to remain open with reduced collateral and debt.
For an example of how this could result in loss of user funds, see [Test Vector 10](#test-vector-10-redemption-scenario).

A full redemption is when the trove's entire debt is redeemed against.  This results in the trove being closed and its surplus collateral (from being overcollateralized)
is sent to the `CollSurplusPool` where it must be claimed with a call to `BorrowerOperations.claimCollateral()`.  This would effectively break the system until the main
trove could be reopened.

##### Mitigation Strategies

**Primary Defense: CR Management**

Because troves are redeemed against in ICR order, we can reduce the redemption risk for the main trove by keeping its CR
high relative to the other troves in the system.

1. **High Initial CR**: Open main trove at 400-500% CR to provide substantial buffer above typical system levels
2. **High MCR for Microloans**: Since the CR of the main trove is the average of the initial trove and all microloans, the MCR for microloans should be set such that the main trove CR remains high relative to the other troves.
3. **Active Monitoring**: Track main trove CR relative to system average and percentile rankings
4. **Emergency Procedures**: Governance intervention capability for critical situations.  For example, pausing the system to allow for emergency collateral to be added.

**Secondary Defense: Emergency Pause Mechanism**

A pause functionality provides critical protection when redemptions create undercollateralization:

1. **Automatic Triggers**: System can automatically pause when backing ratio falls below threshold
2. **Manual Override**: Governance can manually pause when detecting concerning redemption patterns
3. **Operations Restricted**: During pause, block new microloans and withdrawals while allowing deposits
4. **Collateral Recovery**: Use accumulated fees or emergency funding to restore full backing before unpausing

**Benefits of Pause Approach:**
- **No value destruction**: Unlike liquidations, redemptions don't destroy collateral - it's still recoverable
- **Time for response**: Prevents cascading effects while governance addresses shortfall
- **Maintains system integrity**: Shows proactive protection rather than reactive damage control
- **User confidence**: Demonstrates commitment to making users whole

**Operational Safeguards**
1. **CR Thresholds**: Define specific CR levels that trigger different response actions
2. **Backing Ratio Monitoring**: Track available collateral vs. user claims in real-time
3. **User Communication**: Clear disclosure of redemption risks and pause procedures to microloan users
4. **System Monitoring**: Track redemption activity and main trove ranking within system
5. **Emergency Procedures**: Pre-defined governance processes for pause activation and collateral restoration

##### Limitations of Mitigation

**Cannot Eliminate Risk**: Even a very high CR does not guarantee protection as large enough redemptions may target the main trove regardless of initial positioning.

**Pause Limitations**: 
- Requires governance action and funding to resolve shortfalls
- May create temporary liquidity constraints for users
- Depends on having sufficient fee reserves or emergency funding sources

### Test Vectors and Numerical Examples

This section provides concrete numerical examples for key interactions between Microloans and MUSD.  These examples can be used to verify the design before implementation and to test the system once built.

##### Assumptions for All Examples
- BTC price: $100,000
- MUSD minimum debt: 1,800 MUSD
- MUSD gas compensation: 200 MUSD
- MUSD interest rate: 1% APR
- MUSD minimum CR: 110%
- Microloans minimum CR: 115%
- Microloans issuance fee: 0.5%
- Microloans interest rate: 5% APR
- Main trove initial CR: 300%

##### Test Vector 1: Initial State Setup

**Inputs:**
- BTC price: $100,000
- Desired main trove CR: 300%
- MUSD minimum debt: 1,800 MUSD
- MUSD gas compensation: 200 MUSD

**Calculations:**
- Required BTC collateral = (1,800 MUSD + 200 MUSD) * 300% / 100,000 = 0.06 (note no issuance fee since Microloans is fee exempt)
- Main trove debt = 1,800 MUSD (minimum)
- Main trove collateral = 0.06 BTC
- Main trove CR = (0.06 BTC × $100,000) / 2,000 MUSD = 300%

**Expected State:**
```
Main Trove:
- Collateral: 0.06 BTC ($6000)
- Debt: 2000 MUSD
- CR: 300%
- Max borrowing capacity: ~5454.54 MUSD (at 110% CR)
```

#### Test Vector 2: Opening a Microloan

**Inputs:**
- User wants to borrow: 25 MUSD
- BTC price: $100,000
- Microloans minimum CR: 115%
- Issuance fee: 0.5%

**Calculations:**
- Issuance fee = 25 MUSD * 0.5% = 0.125 MUSD
- Total debt = 25 MUSD + 0.125 MUSD = 25.125 MUSD
- Required BTC collateral = (25.125 MUSD * 115%) / $100,000 = 0.0002889375 BTC

**Expected State After Opening:**
```
Main Trove:
- Collateral: 0.0602889375 BTC
- Debt: 2,025 MUSD (only the borrowed amount, no issuance fee)
- CR: 297.7%

User MicroTrove:
- Collateral:  0.0002889375 BTC
- Debt: 25.125 MUSD
- CR: 115%
- Interest rate: 5% APR
```

#### Test Vector 3: Adding Collateral to Microloan

**Inputs:**
- User adds: 0.0001 BTC ($10)
- Current BTC price: $100,000

**Calculations:**
- New user collateral = 0.0002889375 BTC + 0.0001 BTC = 0.0003889375 BTC
- New user CR = (0.0003889375 * 100,000) / 25.125) * 100% = 154.8%

**Expected State After Adding Collateral:**
```
Main Trove:
- Collateral: 0.0603889375 BTC
- Debt: 2025 MUSD
- CR: 298.2%

User MicroTrove:
- Collateral: 0.0003889375 BTC
- Debt: 25.125 MUSD
- CR: 154.8%
```

#### Test Vector 4: Increasing Debt on Microloan

**Inputs:**
- User wants to borrow additional: 5 MUSD
- BTC price: $100,000
- Issuance fee: 0.5%
- Starting from state after adding collateral (Test Vector 3)

**Calculations:**
- Additional issuance fee = 5 MUSD * 0.5% = 0.025 MUSD
- Additional total debt = 5 MUSD + 0.025 MUSD = 5.025 MUSD
- New total user debt = 25.125 MUSD + 5.025 MUSD = 30.15 MUSD
- New user CR = (0.0003889375 BTC * $100,000) / 30.15 MUSD * 100% = 129.0%

**Expected State After Increasing Debt:**
```
Main Trove:
- Collateral: 0.0603889375 BTC ($6,038.89)
- Debt: 2,030 MUSD (2025 + 5, only the borrowed amount)
- CR: 297.5%

User MicroTrove:
- Collateral: 0.0003889375 BTC ($38.89)
- Debt: 30.15 MUSD (includes issuance fees)
- CR: 129.0%
```

#### Test Vector 5: Interest Accrual

**Inputs:**
- Time elapsed: 1 year
- User debt: 30.15 MUSD (from Test Vector 4)
- Microloan interest rate: 5% APR (simple interest, no compounding)
- Main trove interest rate: 1% APR (simple interest, no compounding)
- BTC price: $100,000

**Calculations:**
- Microloan interest accrued = 30.15 MUSD * 5% = 1.5075 MUSD
- New total user debt = 30.15 MUSD + 1.5075 MUSD = 31.6575 MUSD
- Main trove interest accrued = 2,030 MUSD * 1% = 20.30 MUSD
- New main trove debt = 2,030 MUSD + 20.30 MUSD = 2,050.30 MUSD
- New user CR = (0.0003889375 BTC * $100,000) / 31.6575 MUSD * 100% = 122.8%
- New main trove CR = (0.0603889375 BTC * $100,000) / 2,050.30 MUSD * 100% = 294.5%

**Expected State After Interest Accrual:**
```
Main Trove:
- Collateral: 0.0603889375 BTC ($6,038.89)
- Debt: 2,050.30 MUSD (2030 + 20.30)
- CR: 294.5%

User MicroTrove:
- Collateral: 0.0003889375 BTC ($38.89)
- Debt: 31.6575 MUSD
- CR: 122.8%
```

#### Test Vector 6: Liquidation Scenario

**Inputs:**
- Starting from state after interest accrual (Test Vector 5)
- BTC price drops to: $93,604
- User debt: 31.6575 MUSD
- User collateral: 0.0003889375 BTC
- Microloans minimum CR: 115%

**Calculations:**
- New collateral value = 0.0003889375 BTC * $93,604 = $36.40
- New user CR = ($36.40 / 31.6575 MUSD) * 100% = 114.98%
- Since 114.98% < 115% (microloans minimum CR), loan is eligible for liquidation

**Liquidation Execution:**
- Liquidator provides: 31.6575 MUSD
- Liquidator receives: 0.0003889375 BTC ($36.40)
- Liquidator profit = $36.40 - $31.6575 = $4.74
- Main trove debt decreases by: 30 MUSD (only the borrowed amount, not the fees)
- Fees collected after liquidation: 1.6575 MUSD

**Expected State After Liquidation:**
```
Main Trove:
- Collateral: 0.06 BTC ($5,616.24)
- Debt: 2,020.30 MUSD (2050.30 - 30)
- CR: 278.2%

User MicroTrove:
- Status: Liquidated
- Collateral: 0 BTC
- Debt: 0 MUSD
- CR: 0%
```

#### Test Vector 7: Closing a Microloan

**Inputs:**
- User wants to close their microloan
- Starting from state after interest accrual (Test Vector 5)
- User debt: 31.6575 MUSD (includes issuance fees and interest)
- User collateral: 0.0003889375 BTC
- BTC price: $100,000

**Calculations:**
- User pays: 31.6575 MUSD
- User receives: 0.0003889375 BTC ($38.89)
- Main trove debt reduction: 30 MUSD (only the borrowed amount)
- Fees collected by microloans system: 1.6575 MUSD (issuance fees + interest)
- Main trove debt after repayment: 2,050.30 MUSD - 30 MUSD = 2,020.30 MUSD

**Expected State After Closing:**
```
Main Trove:
- Collateral: 0.06 BTC ($6,000)
- Debt: 2,020.30 MUSD
- CR: 297.0%

User MicroTrove:
- Status: Closed
- Collateral: 0 BTC
- Debt: 0 MUSD
- CR: 0%

Microloans System:
- Fees collected: 1.6575 MUSD (0.125 + 0.025 + 1.5075)
  - Issuance fee from initial loan: 0.125 MUSD
  - Issuance fee from debt increase: 0.025 MUSD
  - Interest accrued: 1.5075 MUSD
- Note that in this case the fees collected do not outpace the interest accrued by the microloans system, but as the amount borrowed for microloans increases this gap will decrease and eventually flip to become a surplus.
```

#### Test Vector 8: Recovery Mode Scenario

**Inputs:**
- BTC price drops to: $98,000
- Starting from state after interest accrual (Test Vector 5)
- MUSD system TCR falls to: 149% (below 150% threshold)
- User debt: 31.6575 MUSD
- User collateral: 0.0003889375 BTC
- Main trove debt: 2,050.30 MUSD

**Calculations:**
- New collateral value = 0.0003889375 BTC * $98,000 = $38.11
- New user CR = ($38.11 / 31.6575 MUSD) * 100% = 120.4%
- New main trove collateral value = 0.0603889375 BTC * $98,000 = $5,918.12
- New main trove CR = ($5,918.12 / 2,050.30 MUSD) * 100% = 288.6%
- Both troves remain healthy (above 115% and 110% respectively)

**Recovery Mode Behavior:**
- MUSD system enters recovery mode (TCR < 150%)
- Microloans system detects recovery mode
- Any operations that would decrease TCR are blocked
- User attempts to borrow additional 5 MUSD → **BLOCKED**
- User attempts to add collateral → **ALLOWED**
- User attempts to repay debt → **ALLOWED**

**Expected State During Recovery Mode:**
```
Main Trove:
- Collateral: 0.0603889375 BTC ($5,918.12)
- Debt: 2,050.30 MUSD
- CR: 288.6%

User MicroTrove:
- Collateral: 0.0003889375 BTC ($38.11)
- Debt: 31.6575 MUSD
- CR: 120.4%

System Status:
- MUSD TCR: 149% (recovery mode)
- Microloans: Restricted operations
- New borrowing: BLOCKED
- Collateral addition: ALLOWED
- Debt repayment: ALLOWED
```

#### Test Vector 9: Refinancing Scenario

**Inputs:**
- Starting from initial state (Test Vector 1)
- BTC price: $100,000
- Main trove max borrowing capacity: 5,454.54 MUSD (at 110% CR)
- Each microloan: 100 MUSD at 115% CR
- Issuance fee: 0.5%

**Calculations:**
- Available capacity for microloans: 5,454.54 MUSD - 2,000 MUSD = 3,454.54 MUSD
- Max microloans before refinance: 3,454.54 MUSD / 100 MUSD = 34.54 loans
- We can create 34 full microloans (3,400 MUSD total)
- 35th microloan would require 3,500 MUSD > 3,454.54 MUSD available capacity

**State After 34 Microloans:**
```
Main Trove:
- Collateral: 0.06 BTC + (34 * 0.00115 BTC) = 0.0991 BTC ($9,910)
- Debt: 2,000 MUSD + 3,400 MUSD = 5,400 MUSD
- CR: 183.5%
- Max borrowing capacity: 5,454.54 MUSD (unchanged)
```

**35th Microloan Attempt:**
- User wants to borrow: 100 MUSD
- Required collateral: (100 MUSD * 115%) / $100,000 = 0.00115 BTC
- New main trove debt would be: 5,400 MUSD + 100 MUSD = 5,500 MUSD
- New main trove CR would be: ($9,910 + $115) / 5,500 MUSD * 100% = 182.3%
- Since 5,500 MUSD > 5,454.54 MUSD capacity, refinance is needed

**Refinancing Process:**
- Add user's 0.00115 BTC collateral to main trove
- Call `refinance()` on BorrowerOperations (fee exempt)
- New max borrowing capacity = ($10,025 / 110%) = 9,113.64 MUSD
- Now can borrow the additional 100 MUSD

**Expected State After Refinancing and 35th Microloan:**
```
Main Trove:
- Collateral: 0.10025 BTC ($10,025)
- Debt: 5,500 MUSD
- CR: 182.3%
- Max borrowing capacity: 9,113.64 MUSD (increased from 5,454.54 MUSD)

35th User MicroTrove:
- Collateral: 0.00115 BTC ($115)
- Debt: 100.5 MUSD (includes 0.5% issuance fee)
- CR: 115%
```

**Note:**Even with a price drop that causes maxBorrowingCapacity to fall in absolute terms, a refinance should still provide enough room to cover all active microloan debt since they are all have CR >= 115%.

#### Test Vector 10: Redemption Scenario

**Inputs:**
- Starting from state after refinancing and 35th microloan (Test Vector 9)
- BTC price: $100,000
- Additional system trove: 10,000 MUSD debt at 200% CR (0.2 BTC collateral)
- Redemption amount: 3,500 MUSD

**System State Before Redemption:**
```
Main Trove:
- Collateral: 0.10025 BTC ($10,025)
- Debt: 5,500 MUSD
- CR: 182.3%

Other System Trove:
- Collateral: 0.2 BTC ($20,000)  
- Debt: 10,000 MUSD
- CR: 200%

Active Microloans:
- Total user collateral: 35 * 0.00115 BTC = 0.04025 BTC ($4,025)
- Total user debt: 35 * 100.5 MUSD = 3,517.5 MUSD
```

**Redemption Targeting:**
Since the main trove has the lowest CR (182.3% < 200%), the 3,500 MUSD redemption targets it first.

**Calculations:**
- Redemption consumes: 3,500 MUSD debt
- Proportional collateral reduction: 3,500 MUSD / 5,500 MUSD = 63.64% of main trove
- Collateral redeemed: 0.10025 BTC * 63.64% = 0.06379 BTC ($6,379)
- Remaining main trove collateral: 0.10025 BTC - 0.06379 BTC = 0.03646 BTC ($3,646)
- Remaining main trove debt: 5,500 MUSD - 3,500 MUSD = 2,000 MUSD

**Expected State After Redemption:**
```
Main Trove:
- Collateral: 0.03646 BTC ($3,646)
- Debt: 2,000 MUSD
- CR: 182.3% (unchanged, proportional reduction)

Other System Trove:
- Collateral: 0.2 BTC ($20,000) (unchanged)
- Debt: 10,000 MUSD (unchanged)
- CR: 200% (unchanged)

Active Microloans (unchanged):
- Total user collateral claims: 0.04025 BTC ($4,025)
- Total user debt: 3,517.5 MUSD

System Analysis:
- Available collateral: 0.03646 BTC ($3,646)
- User collateral claims: 0.04025 BTC ($4,025)
- Shortfall: 0.00379 BTC ($379)
- Backing ratio: $3,646 / $4,025 = 90.6%
```

**Impact:**
The redemption creates an undercollateralized position where the main trove cannot fully back outstanding microloan collateral claims. Users collectively face a potential loss of $379 (9.4% shortfall) if they all attempted to withdraw simultaneously.

### Future Work

#### Additional Loan Structures

A similar design allows for arbitrary loan structures to be built on top of MUSD.  As long as the main trove is kept healthy,
the terms of the Microloans can be variable.  Some examples:
- Fixed duration loans that can be liquidated past a certain date.
- Variable interest rate loans.
- Loans backed by other forms of collateral (would require additional risk management logic).

### Open Questions

- What should be the collateralization ratio of the main trove when it is initially opened?
- Who will run the liquidation bot?  We can run it, or we can open source it and allow others to handle the operation.
  - Note that if we want others to run the bot we will need to monitor profitability of liquidations more closely.
- What are the fees?
- What does the upgrade path look like?
