# MUSD V2: Simple Interest Approach

## Overview

This document outlines a block-based simple interest approach to manage debt and calculate interest in MUSD V2. The system uses linear interest calculations to minimize complexity while maintaining accurate debt tracking.

## Key Concepts

### 1. Block-Based Interest Computation
- Interest is computed based on the number of blocks elapsed
- Linear calculation eliminates the need for compound interest complexity

### 2. Total Debt Tracking
For the system, we maintain:
- Total debt amount
- Total interest accrued
- Block number of the last update

### 3. Individual Trove Data
Each trove stores:
- Original debt amount
- Interest stored (accumulated interest)
- Interest rate per block
- Block number when last updated

### 4. Real-Time Interest
- Interest is calculated precisely based on actual blocks elapsed
- No rounding or daily boundaries to consider
- Interest accumulates linearly over time

### 5. Interest Accumulation
- Interest is stored separately from the principal
- New interest is calculated and added to stored interest during each interaction
- Total obligations are the sum of principal and accumulated interest

## Key Operations

### Updating Total System Debt
1. Calculate new interest:
   ```
   new_interest = total_debt * (current_block - updated_at_block) * interest_rate_per_block
   ```
2. Add new interest to total interest
3. Update the last updated block number
4. Mint the calculated new interest and send to PCV

### Opening a New Trove
1. Record the initial debt amount
2. Store the current block number as the update block
3. Initialize stored interest to zero
4. Add debt to total system debt

### Calculating Interest for a Trove
1. Calculate new interest accrued:
   ```
   new_interest = principal * (current_block - updated_at_block) * interest_rate_per_block
   ```
2. Total obligations = principal + stored interest + new interest

### Closing or Modifying a Trove
1. Calculate final interest owed up to current block
2. Add final interest to stored interest
3. Process repayment of total obligations (debt + total interest)

## Advantages of this Approach

1. Simplicity: Linear calculations are straightforward and easy to understand
2. Precision: Interest calculated exactly based on blocks elapsed
3. Gas Efficiency: Simple mathematical operations
4. No Time Dependencies: No daily updates or maintenance required
5. No Rounding Issues: Exact calculations without partial period complexity

## Considerations

- Simple interest results in lower total interest compared to compound interest
- May be less competitive compared to other DeFi protocols using compound interest
- Interest doesn't earn interest, which may not reflect traditional lending practices
- Block time variations could affect interest calculation precision
- Protocol earns less revenue compared to compound interest approaches
- Revenue stream is dependent on user interaction as we only mint the interest when total interest value changes