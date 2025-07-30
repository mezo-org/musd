# MUSD Microloans RFC

## Motivation

- MUSD's minimum loan size of 1800 excludes many users. Some may want to borrow smaller amounts to try out the system before taking out a larger loan, or they simply may not need to borrow that much MUSD.
- We are seeking to increase the overall MUSD volume by allowing users access to MUSD loans with a much smaller minimum (e.g. $25).
- As a secondary goal, keeping the user experience (at least the frontend) close to the MUSD/Borrow experience is valuable so that users can get a feeling for how the system works if they do choose to borrow more later. It's not critical that the systems be exactly 1 to 1, but if we can present them similarly, that is a plus.

## Background on MUSD

MUSD has the following parameters:
- minimum debt of 1800 musd
- 200 musd gas compensation added to initial debt that is refunded when the trove is closed. this is used as liquidation reward if the user is liquidated and is not actual debt in the usual sense.
- 0.1% origination fee
- 20% of origination fee charged for refinancing
- Maximum borrowing capacity set to the amount of debt that would create a 110% CR loan. This is set at the time of loan origination and only increases when the loan is refinanced.
- Minimum collateralization ratio of 110%. Below this troves are eligible for liquidation.
- Minimum system collateralization ratio of 150%. Below this, the system enters recovery mode, and no operations that would decrease trove CR (such as borrowing more) are allowed until the system leaves recovery mode.
- There is more but that's most of what is relevant for now.

## Proposed Solution
## Proposed Solution

- Create a new protocol, called Microloans, allowing users to borrow smaller amounts (for example, $25).
- The Microloans contract takes out a loan from MUSD for the minimum amount (e.g. 1,800 MUSD) at an initial safe collateralization ratio (e.g. 200%).
- When a user wants to borrow (for example, $25), the system accepts collateral from the user above the MUSD minimum CR (e.g. 200%), adds the collateral to its main trove, and increases the trove’s debt by the requested amount.  
  **Example:** The user deposits $50 worth of collateral and borrows an additional $25.
- Users pay an origination fee when their loan is opened and accumulate ongoing interest, which is tracked as part of their debt. When the user wants to close the loan, they repay their original borrowed amount, the origination fee, and any accrued interest. Repaying this amount allows them to withdraw all their collateral.
- When a user closes their microloan, the contract uses the MUSD repayment to pay down the associated debt in the main trove and returns the corresponding collateral to the user.

### Liquidations

- There will be a minimum collateralization ratio (CR) for microloans that is higher than the minimum for MUSD (e.g. 115%).
- If the user's CR falls below this threshold, the loan is eligible for liquidation.
- The `liquidate` function marks the user's trove as closed by liquidation, withdraws the user's collateral from the contract’s main trove, and sells it. The proceeds are used to pay down the user’s portion of the debt in the main trove.  Exact mechanism to be discussed later.
- **Example:** If the user deposited $50 of collateral and the value drops to $28.75, `liquidate` would sell the collateral for $28.75, pay off the $25 debt, and have $3.75 left over. This excess can be used as an incentive for liquidators.
- After liquidation, the user's collateral cannot be reclaimed by them.