# MUSD V2: Simplified Debt and Interest Management

## Overview

This document outlines the simplified approach used in MUSD V2 to manage debt and calculate interest efficiently. The system is designed to handle multiple interest rates while minimizing gas costs, maintaining accuracy, and reducing complexity.

## Key Concepts

### 1. Daily Interest Computation

- Total system interest is computed and applied globally on a daily basis.
- This frequent update ensures accuracy without the need for complex partial period calculations.

### 2. Total Debt Tracking

For each interest rate in the system, we maintain:
- Total debt at that interest rate
- Timestamp of the last interest computation (updated daily)

### 3. Individual Trove Data

Each trove stores:
- Current debt amount
- Interest rate
- Timestamp of when the loan was opened or last modified

### 4. Full-Day Interest on Opening

- New loans are charged a full day's interest for the day they are opened, regardless of the exact time of opening.
- This simplifies calculations and eliminates the need for partial day interest tracking.

### 5. Daily Interest Minting

- Each day, when interest is calculated, the corresponding amount of MUSD is minted and sent to the PCV (Protocol Controlled Value) contract.
- This ensures accurate accounting of accrued interest, even before it's applied to individual troves.


## Key Operations

### Updating Total System Debt (Daily)

1. For each interest rate:
   1. Retrieve the total debt and last computation time.
   2. Calculate the interest for one day.
   3. Add the calculated interest to the total debt.
   4. Mint the calculated interest amount in MUSD and send it to the PCV contract.
   5. Update the last computation timestamp to the current date.

### Opening a New Trove

1. Add the new trove's debt to the total debt for its interest rate.
2. Store the trove's initial debt, interest rate, and current timestamp.
3. Charge the user a full day's interest for the opening day.

### Calculating Interest for a Trove

1. Retrieve the trove's current debt, interest rate, and opening/last modification timestamp.
2. Calculate the number of full days elapsed since the opening/last modification.
3. Apply the daily interest rate to the trove's debt for the number of days elapsed.
4. Update the trove's debt and timestamp.

### Closing or Modifying a Trove

1. Calculate the interest owed on the trove up to the current day before performing any modifications.
2. Update the total system debt accordingly.

## Advantages of this Approach

1. Simplicity: Eliminates need for complex overage credit calculations.
2. Consistency: All loans are treated uniformly, with no special cases for partial periods.
3. Gas Efficiency: Avoids iterating through all troves for interest calculations.
4. Accuracy: Daily compounding provides a good balance between precision and simplicity.
5. Transparency: Easier for users to understand how interest is calculated.
6. Flexibility: Allows for trove operations at any time without complex partial period handling.
7. Consistent Protocol Revenue: Daily minting of interest to PCV ensures accurate protocol revenue accounting independent of user actions.

## Considerations

- Users are charged a full day's interest on the opening day, which might be slightly more than a partial day calculation for loans opened late in the day.
- The system requires daily updates to maintain accuracy, but these can be automated and are simpler than managing partial periods.
- The daily minting of MUSD for interest ensures that the protocol's accounting of earned interest is always up-to-date, even if users haven't interacted with their troves.