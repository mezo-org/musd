# MUSD Microloans RFC

## Motivation

- MUSD's minimum loan size of 1800 excludes many users. Some may want to borrow smaller amounts to try out the system before taking out a larger loan, or they simply may not need to borrow that much MUSD.
- We are seeking to increase the overall MUSD volume by allowing users access to MUSD loans with a much smaller minimum (e.g. $25).
- As a secondary goal, keeping the user experience (at least the frontend) close to the MUSD/Borrow experience is valuable so that users can get a feeling for how the system works if they do choose to borrow more later. It's not critical that the systems be exactly 1 to 1, but if we can present them similarly, that is a plus.

## Background on MUSD

MUSD has the following parameters:
- Minimum debt of 1800 MUSD
- 200 MUSD gas compensation added to initial debt that is refunded when the trove is closed. this is used as liquidation reward if the user is liquidated and is not actual debt in the usual sense.
- 0.1% origination fee
- 20% of origination fee charged for refinancing
- Maximum borrowing capacity set to the amount of debt that would create a 110% CR loan. This is set at the time of loan origination and only increases when the loan is refinanced.
- Minimum collateralization ratio of 110%. Below this troves are eligible for liquidation.
- Minimum system collateralization ratio of 150%. Below this, the system enters recovery mode, and no operations that would decrease trove CR (such as borrowing more) are allowed until the system leaves recovery mode.

## Proposed Solution

- Create a new protocol, called Microloans, allowing users to borrow smaller amounts (for example, $25).
- The Microloans contract takes out a loan from MUSD for the minimum amount (e.g. 1,800 MUSD) at an initial safe collateralization ratio (e.g. 200%).
- When a user wants to borrow a smaller amount (e.g. $25), the system accepts collateral from the user, adds the collateral to its main trove, and increases the trove’s debt by the requested amount. 
  **Note:** The collateral amount required to open a microloan must meet a minimum CR that is higher than the MUSD minimum (exact amount TBD).
  **Example:** The user deposits $50 worth of collateral and borrows an additional $25 (200% CR).  The Microloans contract adds $50 worth of collateral to its trove and borrows 25 MUSD which it then sends to the user.
- Users pay an origination fee when their loan is opened and accumulate ongoing interest, which is tracked as part of their debt. When the user wants to close the loan, they repay their original borrowed amount, the origination fee, and any accrued interest. Repaying this amount allows them to withdraw all their collateral.
- When a user closes their microloan, the contract uses the MUSD repayment to pay down the associated debt in the main trove and returns the corresponding collateral to the user.

### Liquidations

- There will be a minimum collateralization ratio (CR) for microloans that is higher than the minimum for MUSD (e.g. 115%).
- If the user's CR falls below this threshold, the loan is eligible for liquidation.
- Liquidation means:
  - The user's trove is marked as closed by liquidation and they can no longer reclaim their collateral.
  - The user's collateral is withdrawn from the main trove and sold (mechanism TBD).
  - Proceeds used to pay down the user's portion of the trove's debt.
  - Additional proceeds can be used for liquidation incentives and/or protocol revenue.
  - **Example:** If the user deposited $50 of collateral and the value drops to $28.75, `liquidate` would sell the collateral for $28.75, pay off the $25 debt, and have $3.75 left over. This excess can be used as an incentive for liquidators.
- Possible liquidation mechanisms:
  - public `liquidate` function that distributes some amount of the collateral excess to the caller and "sells" the rest
  - "selling" could either use the existing MUSD/BTC pool, or it could mean that the caller of `liquidate` must pay the MUSD debt, essentially buying BTC at a discount

### Collateralization, Liquidation Buffer, and Catastrophic Scenarios

- As the price of collateral falls, individual microloans get liquidated when they drop below the minimum CR (e.g. 115%, providing a 5% buffer over MUSD’s 110% minimum). This buffer is intended to allow the system to sell the user’s collateral and cover the corresponding debt before the main trove is jeopardized.
- In scenarios where there is a highly overcollateralized main trove with a number of lower CR microloans, the liquidation of these lower CR microloans helps to keep the main trove healthy by continuously paying down its debt.
- This setup works except in a scenario where the initial $2,000 loan itself is at risk of liquidation, and it is the main factor pulling down the average CR.
- To mitigate catastrophic scenarios, one approach is to initially open the $2,000 loan with a high collateralization ratio (for example, 500%). This provides a buffer, so that even if the price drops severely (e.g. to 20% of its original value), the main trove is still protected up to that point.
- By also imposing a maximum on the collateralization ratio of microloans (equal or less than the main trove’s current CR), it would prevent microloans from ever being more overcollateralized than the main trove. This would in theory ensure that there cannot be a situation where the pool is wiped out due to a single main trove liquidation while some microloans are fully collateralized.
