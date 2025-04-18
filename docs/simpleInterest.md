# mUSD V2: Simple Interest Approach

## Overview

This document outlines a block-based simple interest approach to manage debt and calculate interest in mUSD V2. The system uses linear interest calculations to minimize complexity while maintaining accurate debt tracking.

## Key Concepts

### 1. Time-Based Interest Computation

- Interest is computed based on elapsed time (in seconds)
- Linear calculation eliminates the need for compound interest complexity
- Uses timestamps for precise time tracking

### 2. Total Debt Tracking

For the system, we maintain:

- The sum of each principal multiplied by its rate (aggreated interest numerator)
- Timestamp of the last update
- The total accrued principal and interest in the active pool

### 3. Individual Trove Data

Each trove stores:

- Original debt amount
- Interest owed
- Interest rate
- Maximum borrowing capacity at current rate (fixed at opening based on 110% CR capacity)
- Last update timestamp

### 4. Real-Time Interest

- Interest is calculated precisely based on actual time elapsed
- No rounding or daily boundaries to consider
- Interest accumulates linearly over time

### 5. Interest Accumulation and Distribution

- Interest is stored separately from the principal
- New interest is calculated and added to owed interest during each user interaction with a trove
- Total obligations are the sum of principal and accumulated interest
- Interest distribution to PCV and gauge pool is done separately from interest calculation
- System maintains flexibility to batch interest payments

## Key Operations

### Updating Total System Interest

System interest is stored with an aggregated rate. When a user uses the system, the interest is updated:

1. Calculate new interest:
   ```
   new_interest = interest_numerator * (current_timestamp - last_update_timestamp) / seconds_in_a_year
   ```
2. Add new interest to total interest owed
3. Update the last update timestamp

Whenever principal is added (or removed), we update interest and then update the `interest_numerator`

```
interest_numerator = interest_numerator + added_principal * interest_rate
```

This means that `interest_numerator` represents an aggregated interest rate (in bips) for the system.

### Opening a New Trove

1. Record the initial debt amount
2. Calculate maximum borrowing capacity at 110% CR
3. Set fixed interest rate based on maximum capacity (not initial borrow)
4. Store the current timestamp as the update time
5. Initialize stored interest to zero
6. Add principal to total system principal

### Calculating Interest for a Trove

1. Calculate new interest accrued:
   ```
   new_interest = principal * (current_timestamp - last_update_timestamp) * interest_rate_per_second
   ```
2. Total obligations = principal + stored interest + new interest

### Trove Interactions (Borrowing/Repaying/Adjusting)

1. Calculate new interest owed up to current timestamp
2. Update the system's total interest
3. Add new interest to stored interest for the trove
4. Mint and distribute accumulated interest to PCV and gauge pool
5. Process the requested operation (note that repayments will first be applied to owed interest before paying off principal)
6. Adjust the `interest_numerator`

### Closing a Trove

1. Calculate final interest owed up to current timestamp
2. Update the system's total interest
3. Add final interest to stored interest
4. Process repayment of total obligations (debt + total interest)
5. Mint and distribute any remaining unminted interest
6. Adjust the `interest_numerator`

## Advantages of this Approach

1. Simplicity: Linear calculations are straightforward and easy to understand
2. Precision: Interest calculated exactly based on elapsed time
3. Gas Efficiency: Simple mathematical operations
4. Consistent Interest: Time-based calculation provides more predictable interest accrual
5. No Rounding Issues: Exact calculations without partial period complexity
6. Rate Stability: Borrowers have predictable rates up to their maximum capacity
7. Flexible Interest Distribution: Can batch interest payments for gas optimization

## Considerations

- Simple interest results in lower total interest compared to compound interest
- Interest doesn't earn interest, which may not reflect traditional lending practices
- Protocol earns less revenue compared to compound interest approaches
- Interest distribution is batched but must be tracked carefully
- Fixed rates based on maximum capacity may result in lower initial yields if users don't borrow their full capacity
- Revenue stream is dependent on user interaction as we only mint the interest when total interest value changes
- Time-based calculations are more predictable than block-based ones
- Timestamp manipulation by miners is theoretically possible but impact is minimal due to practical constraints
