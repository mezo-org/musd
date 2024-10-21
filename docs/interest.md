## Overview

### Purpose

We want to be able to apply an interest rate to deposits.  One of the challenges of applying an interest rate is applying
it to the troves in a gas efficient way.  Iterating through the full list of troves would be prohibitively expensive.  
Instead, we will keep track of the total debt in the system at each interest rate along with a debt index that is updated
periodically to reflect the compounded interest over time.  Interest can then be calculated and collected at regular intervals
without the need to handle each trove individually.

### Key Concepts

#### Debt Index

The debt index is a global variable that tracks compounded interest over time for all troves at a given interest rate.
Each trove stores its debt along with the debt index at the time the trove was opened.  The global debt index is updated
at regular intervals and whenever a user interacts with the protocol.  To calculate a user's effective debt, the current
debt index can be used along with the ratio of the user's initial debt to the debt index at the time the user's trove was
opened.

The formula for updating the debt index is:

`D_next = D_current * (1 + r / n)`

Where:
- `D_current` is the current debt index.
- `r` is the annual interest rate.
- `n` is the number of compounding periods per year.

#### Total Debt

The total debt is the aggregate debt in the system for a given interest rate.  It is used along with the debt index to
calculate the interest owed for a given period.  By keeping track of total debt this way, we are able to avoid calculating
the interest for each trove individually.

#### Overage Credit

Because we calculate interest periodically, we need a way to account for partial-period loans.  When a user opens a trove,
we know how much interest would have been paid if the trove had been open for the entire period up to this point.  We store
this amount as the overage credit.  When we go to calculate interest, we can calculate the interest for the full period
and then subtract the overage credit to get the correct amount of interest owed.

### Example Scenario

Below is an example scenario to illustrate how the debt index, total debt, and overage credit are used to calculate interest.
Note that in practice there would be multiple interest rates, but for simplicity, we will use a single interest rate in
this example.  The process would be the same with multiple interest rates, just with additional calculations for each rate.


1. **Initialization**
    - Annual interest rate (`r`) = 5%
    - Monthly interest rate = 5% / 12 = 0.4167% = 0.004167
    - Debt index starts at `D_0 = 1`

2. **Month 0**
    - **Alice opens a loan for 100 mUSD at time 0.**
        - Alice's initial debt: `Debt_A0 = 100`
        - Alice's debt index at loan opening: `D_A0 = 1`
        - Total debt in the system: `Total_Debt_0 = 100`
        - Overage credit: `overageCredit_0 = 0`

3. **Month 1**
    - **Update Debt Index**
        - New debt index: `D_1 = D_0 * (1 + 0.004167) = 1 * 1.004167 = 1.004167`
    - **Update Total Debt**
        - Total debt: `Total_Debt_1 = Total_Debt_0 * (1 + 0.004167) = 100 * 1.004167 = 100.4167`

4. **Month 2**
    - **Bob opens a loan for 100 mUSD halfway through the month.**
        - Debt index at Bob's loan opening: `D_B_mid = 1.004167 * (1 + 0.004167 / 2) = 1.004167 * 1.002083 = 1.00625`
        - Bob's initial debt: `Debt_B0 = 100`
        - Bob's prorated interest for half the month: `100 * 0.002083 = 0.2083`
        - Adjust total debt for Bob's loan:
            - Total debt before Bob's loan: `Total_Debt_1 = 100.4167`
            - Effective debt added for the half month: `100 * 1.002083 = 100.2083`
            - Total debt after Bob's loan: `Total_Debt_1 = 100.4167 + 100.2083 = 200.625`
            - Bob's overage credit for half the month: `overageCredit_2 = 100 * (D_2 - D_B_mid) = 100 * (1.008350 - 1.00625) = 0.21`
    - **Update Debt Index**
        - New debt index: `D_2 = 1.004167 * (1 + 0.004167) = 1.008350`
    - **Update Total Debt**
        - Total debt before overage credit: `Total_Debt_2 = 200.625 * (1 + 0.004167) = 200.625 * 1.004167 = 201.4604`
        - Adjust total debt with overage credit: `Total_Debt_2 = 201.4604 - 0.21 = 201.2504`

5. **Month 3**
    - **Alice pays down 50 mUSD halfway through the month.**
        - Debt index at Alice's payment: `D_A_mid = 1.008350 * (1 + 0.004167 / 2) = 1.008350 * 1.002083 = 1.01045`
        - Alice's debt before payment: `Debt_A_mid = 100.4167 * (1.01045 / 1.004167) = 101.0485`
        - Alice's remaining debt after payment: `Remaining_Debt_A = 101.0485 - 50 = 51.0485`
        - Adjust total debt for Alice's payment:
            - Effective debt reduction: `50 * (D_3 / D_A_mid) = 50 * (1.012552 / 1.01045) = 50.1042`
            - New total debt after Alice's payment: `Total_Debt_2 = 201.2504 - 50.1042 = 151.1462`
    - **Update Debt Index**
        - New debt index: `D_3 = 1.008350 * (1 + 0.004167) = 1.012552`
    - **Update Total Debt**
        - Total debt: `Total_Debt_3 = 151.1462 * (1 + 0.004167) = 151.1462 * 1.004167 = 151.7789`