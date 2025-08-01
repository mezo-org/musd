# RFC-1: Microloans

## Background

- MUSD's minimum loan size of 1800 excludes many users. Some may want to borrow smaller amounts to try out the system before taking out a larger loan, or they simply may not need to borrow that much MUSD.
- We are seeking to increase the overall MUSD volume by allowing users access to MUSD loans with a much smaller minimum (e.g. $25).
- As a secondary goal, keeping the user experience (at least the frontend) close to the MUSD/Borrow experience is valuable so that users can get a feeling for how the system works if they do choose to borrow more later. It's not critical that the systems be exactly 1 to 1, but if we can present them similarly, that is a plus.

## Current Functionality

MUSD has the following parameters:

- Minimum debt of 1800 MUSD
- 200 MUSD gas compensation added to initial debt that is refunded when the trove is closed. this is used as liquidation reward if the user is liquidated and is not actual debt in the usual sense.
- 0.1% origination fee
- 20% of origination fee charged for refinancing
- Maximum borrowing capacity set to the amount of debt that would create a 110% CR loan. This is set at the time of loan origination and only increases when the loan is refinanced.
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

- The Microloans contract takes out a loan from MUSD for the minimum amount (e.g. 1,800 MUSD) at an initial safe collateralization ratio (e.g. 300%).

#### Opening a Microloan

- A user wants to borrow a smaller amount (e.g. $25).
- The system accepts collateral from the user (e.g. $50 worth for a 200% CR loan).
**Note:** The collateral amount required to open a microloan must meet a minimum CR that is higher than the MUSD minimum (exact amount TBD).
- The system adds the collateral to its main trove and increases the main trove’s debt by the requested amount. 
- The system sends the borrowed MUSD to the user and creates a MicroTrove to track their collateral and debt.
- In addition to the amount borrowed, an origination fee will be added to the user's initial debt.
- An ongoing fixed interest rate will be also be charged on the user's debt.

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

### Liquidations

- There will be a minimum collateralization ratio (CR) for microloans that is higher than the minimum for MUSD.  This is to
provide a buffer so that the microloans can be liquidated *before* the main trove is at risk of liquidation.
- If the user's CR falls below this threshold, the loan is eligible for liquidation.
- Once a loan is liquidated, the user's trove is marked as closed by liquidation, and they can no longer reclaim their collateral.

#### Liquidation Mechanism

There is a public `liquidate` function callable by anyone that can supply:
- A MicroTrove address that is eligible for liquidation
- MUSD equal to the MicroTrove's debt

On calling `liquidate`:
- The MUSD from the caller is used to pay down the main trove's debt by the MicroTrove's debt amount
- The MicroTrove's collateral is sent to the caller.  Note this should be profitable for the caller as the trove is overcollateralized.
- For example if the user deposited $50 of collateral to borrow $25 and the value of the collateral drops to $28.75:
  - Caller provides $25 of collateral to `liquidate`
  - `liquidate` pays down the outstanding debt and sends $28.75 worth of collateral to the caller, netting a profit of $3.75.
- The user's trove is marked as closed by liquidation.

### Collateralization, Liquidation Buffer, and Catastrophic Scenarios

- As the price of collateral falls, individual microloans get liquidated when they drop below the minimum CR (e.g. 115%, providing a 5% buffer over MUSD’s 110% minimum). This buffer is intended to allow the system to sell the user’s collateral and cover the corresponding debt before the main trove is jeopardized.
- In scenarios where there is a highly overcollateralized main trove with a number of lower CR microloans, the liquidation of these lower CR microloans helps to keep the main trove healthy by continuously paying down its debt.
- This setup works except in a scenario where the initial $2,000 loan itself is at risk of liquidation, and it is the main factor pulling down the average CR.
- To mitigate catastrophic scenarios, one approach is to initially open the $2,000 loan with a high collateralization ratio (for example, 500%). This provides a buffer, so that even if the price drops severely (e.g. to 20% of its original value), the main trove is still protected up to that point.
- By also imposing a maximum on the collateralization ratio of microloans (equal or less than the main trove’s current CR), it would prevent microloans from ever being more overcollateralized than the main trove. This would in theory ensure that there cannot be a situation where the pool is wiped out due to a single main trove liquidation while some microloans are fully collateralized.
