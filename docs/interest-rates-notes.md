# Notes on Interest Rates Progress

## Current Status

Since we are setting down work on the interest rates feature for now, this document is intended to serve as a record of the
progress made so far and to help provide guidance for continuing work in the future.

There are a few branches in addition to this one that are relevant to the work:
- https://github.com/thesis/musd/tree/interest-rate-take2
  - Contains the work for getting and setting interest rate and maximum interest rate all in V1 of TroveManager
  - Functionality:
    - Getting the current interest rate
    - Getting the record of historical interest rates and the blocks they were set
    - Proposing and approving a new interest rate (two transactions, 7 day delay required between proposal and approval)
    - Emitting an event when the interest rate changes
    - Setting the maximum interest rate
- https://github.com/thesis/musd/tree/supporting-two-versions
  - Essentially the same as the above but with the changes migrated over to TroveManagerV2
- https://github.com/thesis/musd/tree/calculate-interest
  - Contains work for calculating the interest owed on a trove and functions for updating the trove's debt based on interest owed, again all in V1

This branch is an attempt at migrating over the changes from calculate-interest over to V2.  After diving into it a bit,
we determined that it would be best to finish porting over everything from V1 before starting to add new functionality in V2.
For that reason, this branch is left to work on later.

## Context and Purpose

See the [product pitch page](https://coda.io/d/_d_vIDNPK008#Mezo-Product-Pitches_tudN3/r111&view=full) for the full description of the work.

## Changes Made

As mentioned above, the branches mentioned cover getting and setting of interest rates along with calculating interest on a trove and
updating the trove's debt to reflect accrued interest.  A partial migration to V2 is also included.

## Pending Tasks

Here's how I originally intended on splitting up the work:

- Tracking and calculating interest owed in the system
  - Calculate interest owed for a single trove (done)
  - Update trove with interest owed (just the function, trigger for this can be later) (done)
  - Track total debt in the system
  - Calculate interest on total debt in system
- PCV
  - Receives streamed interest
  - Can harvest the interest at any frequency
- Liquidations
  - Should take into account interest owed
- Odds and Ends
  - SortedTroves - ensure order is maintained
  - Additional tests
  - Documentation
  - Access Control - setting the council/governance addresses

## Challenges and Concerns

- The effects of compounding vs. simple interest should be considered.
- Using a global debt index per interest rate to make calculating interest in the system gas efficient is preferred.

## Next Steps

The next steps when picking this work back up would likely be to finish porting everything over to v2 and then continue
with the split of work described above.  There is currently a failing test for BorrowerOperations that would be a good 
place to start.  The breakage is likely to do with deployment of V2 contracts.