# RFC-2: Lending Arbitrage Microloans

## Background

MUSD's minimum debt size of 1800 excludes many users. Some may want to borrow
smaller amounts to try out the system before taking out a larger loan, or they
simply may not need to borrow that much MUSD.

We are seeking to increase the overall MUSD volume by allowing users access to
MUSD loans with a much smaller minimum (e.g. $25).

As a secondary goal, keeping the user experience (at least the frontend) close 
to the MUSD borrow experience is valuable so that users can get a feeling for
how the system works if they do choose to borrow more later. It is not critical
that the systems be exactly 1 to 1, but if we can present them similarly, that
is a plus.

We generally expect to see two types of users borrowing the smaller amounts.
The first type of user will borrow a small amount of MUSD with the minimum
possible collateralization and spend that MUSD. They will not come back to
manage the collateral or repay the debt. The second type of user will mint
a small amount of MUSD with a relatively safe collateralization and play with
the system. They will keep an eye on collateralization, and after some time,
when they are comfortable using the system, they will come back to put more
money in. 

The RFC-1: Microloans was the first attempt at solving this problem by
introducing a separate smart contract allowing to borrow any amount below the
current's MUSD protocol minimum of 1800 and above the minimum proposed microloan 
size of 50 MUSD. This flexibility came from the fact, the smart contract offering
microloans had its own trove open in the MUSD protocol and could mint any amount
of MUSD based on the provided collateral.

That flexibility came with the cost. After gaining traction and enough users
trying the system with the minimum collateralization ratio allowed, the trove
controlled by the microloans contract is at constant risk of being a target of
external MUSD redemptions. With the collateral removed from the trove,
protecting the user experience - especially for the second user type who wants 
to come back and repay their debt - is complicated. 

RFC-2: Lending Arbitrage Microloans is an attempt to offer microloans in a way
that is protecting the user experience at the cost of scalability of the first
release. Possible solutions for scaling, after getting enough traction, are
proposed as the next steps but they are out of the scope of this RFC.

## Proposal

Create a new protocol, called Microloans, offering users to borrow smaller
amounts between 25 and 200 MUSD on a fixed 3-month term with 5% APR and minimum
collateralization ratio of 110%. The MUSD borrowed comes from a third party
lending it and earning the 4% spread. We should be able to maintain the same
frontend as for the original MUSD experience with some limitations and
additional copy.

### Goal

From a user perspective, the Microloans protocol should be similar to the
original MUSD borrow experience, but with limitations. The goal is to allow
users to try out the system with a smaller debt before committing to a larger
one. At the same time, we need to protect the mechanism against the users who
will never come back to manage the collateral.

Most user actions available in the original MUSD borrow experience are also
available in Microloans, such as:

- Opening a trove
- Closing a trove
- Repaying debt
- Borrowing more MUSD
- Adding more collateral
- Withdrawing collateral

Note that some of these actions may have additional requirements and
limitations, but the user experience should be similar.

Some user actions may not be available in Microloans, such as:

- Refinancing
- Redemption

Additionally, liquidations will work slightly differently in Microloans,
although a user the experience should be the same in terms of managing their
liquidation risk.

The most important difference is the fact the loan is fixed-term. After 3
months, the loan is automatically liquidated if it is not repaid before, no
matter the collateralization.

### Implementation

#### Initial state

A Microloans contract is funded with at least 10,000 MUSD allowing, for a maximum
of 50 micro troves with the maximum allowed 200 MUSD debt. The higher the
funding amount, the more micro troves can be opened.

No changes to the MUSD protocol are needed.

#### Opening a micro trove

- A user wants to borrow a smaller amount, between 25 and 200 MUSD.
- The system accepts BTC collateral from the user, e.g. $50 worth of BTC for
  a 200% collateralization ratio loan assuming 25 MUSD is borrowed. The
  collateral amount required to open a micro trove must meet a minimum
  collateralization ratio of 110% and a maximum collateralization ratio of 500%.
- The system accepts the collateral and stores it in a BTC collateral pool in
  the Microloans smart contract.
- The system sends the borrowed MUSD to the user from the pool of MUSD available
  in the Microloans smart contract.
- In addition to the amount borrowed, an issuance fee will be added to the
  user's initial debt.
- An ongoing fixed interest rate will be also be charged on the user's debt.

**Note:** We enforce the maximum 500% collateralization ratio to clearly 
distinguish micro troves with a maximum of $1000 worth of BTC provided as
collateral from MUSD protocol troves with a minimum of $2000 worth of BTC
provided as collateral.

**Note:** A given address may only have one micro trove at a time. However,
an address may have an MUSD trove and a micro trove simultaneously.

#### Closing a micro trove

- A user wants to close their micro trove.
- The system accepts MUSD from the user equal to their debt including any
  interest accrued.
- This MUSD is put back in the Microloans contract MUSD pool.
- The user's original collateral is withdrawn from the Microloans contract BTC
  collateral pool.
- The user's collateral is sent back to the user and the micro trove is marked
  as closed.

#### Adjusting a micro trove

Loan adjustments - adding or withdrawing collateral, increasing or decreasing
debt - work much the same as opening or closing a micro trove:

- Additional collateral is added to the Microloans contract BTC collateral pool
- Withdrawn collateral is sent to the user.
- Increasing debt causes the Microloans contract to send more MUSD from the pool
  to the user.
- Decreasing debt puts back MUSD from the user in the Microloans contract MUSD
  pool.

Note that these actions are subject to limitations due to collateral ratio
constraints. That is, we require the entire micro trove to maintain a minimum of
110% collateralization and a maximum of 500% collateralization.

#### Liquidations

There are two scenarios when a deposit can be liquidated. When the
collateralization ratio drops below 110%, the liquidator claims the entire
collateral. When the loan is at term, the liquidator claims 10% of the
collateral and the remaining part is left for the user to claim back.
The profitability of the bot is quite low with the micro trove size so we need
to ensure there is at least one liquidation bot running, either by us, of by the
party who borrowed MUSD, or by a reliable third party.

##### Liquidation mechanism

There is a public `liquidate` function callable by anyone who can supply:
- A borrower address that is eligible for liquidation.
- MUSD equal to the micro trove's debt.

On calling `liquidate`:
- The MUSD from the caller is used to pay down the micro trove's debt and sent
  back to the Microloans contract's MUSD pool.
- Depending on the liquidation case, a certain portion of the micro trove's
  collateral is sent to the caller. Note this should be profitable for the
  caller as the trove is overcollateralized.
- For example if the user deposited $50 of worth in BTC as collateral to borrow
  25 MUSD and the value of the collateral drops to $28.75:
  - Caller provides 25 MUSD of collateral to `liquidate`.
  - `liquidate` pays down the outstanding loan and sends $28.75 worth of
  collateral to the caller, netting a profit of $3.75.
- The user's trove is marked as closed by liquidation.

##### Liquidate and swap

To offload some of the complexity from the off-chain bot, the Microloans
contract should offer a function allowing to liquidate and swap the collateral
back into MUSD in the same transaction. For this task, an existing MUSD/BTC pool
available on Mezo should be used. A front-running protection against mempool
scanners should be considered as part of the implementation and an exact
mechanism is out of the scope of this RFC.

#### Promotions

We will allow for users to "promote" their micro troves to full MUSD troves. 
This will allow for users to test the waters with micro troves and then
seamlessly upgrade without losing their position.  

For example, say a user has a micro trove with 50 MUSD in debt and $100 worth of
collateral. They show up with $2900 worth of collateral (picked so that their
promoted trove is at 150% CR with minimum debt, this could be any other amount 
that results in a valid MUSD trove) and want to "promote" their micro trove to
a 2000 MUSD trove:

- Contract accepts the $2900 worth of collateral and withdraws the user's $100 of
  collateral.
- Contract calls `openTroveWithSignature` with the borrower as the `_borrower`
  parameter and itself as the `_recipient`.
- Contract receives 2000 MUSD, uses 50 of it to close the micro trove and sends
  the remaining 1950 to the user.
- The user now has their desired position: 2000 in MUSD debt (plus some fees)
  backed by 3k worth of collateral.

#### Micro trove and debt

The Microloans contract allows to keep an open micro trove without an active
debt and only the debt has a term. When collateral is withdrawn after fully
repaying the debt or after the liquidation, the micro trove is marked as closed 
and then deleted so that the  user can open a new one later. This approach allows
the user to execute a number of experiments without switching their address.

To protect against the manipulation, when the trove is adjusted and there is an
active debt, the debt term date is not modified. Also, we will require a minimum
collateral equal to 110% of the minimum debt to remain in a non-liquidated trove
to ensure one is not spamming the contract with dust micro troves.

#### Withdrawing MUSD by the lending arbiter

The party who provides MUSD to the Microloans contract to lend it further needs
to be able to withdraw their capital. The MUSD from closed or liquidated troves
can be borrowed again and the arbiter needs to be able to stop this loop to
claim their capital back.

The Microloans contract should provide a function callable only by the arbiter's
address to request withdrawal of a specific amount of MUSD borrowed to the
contract. When opening a new trove, the contract needs to consult the value of
requested withdrawal to see if enough collateral is left in the contract to open
the trove. If not, the open trove function should revert.

Note that anyone can donate MUSD to the Microloans contract at any time, but
we will treat the entire MUSD balance as provided by the single arbiter. 

To prevent the arbiter from stopping the system immediately without a prior
warning, we will deploy a timelock contract between the arbiter's address and
the Microloans contract. Only the timelock contract will be able to request
withdrawals. 

#### Contract storage

The Microloans contract holds the micro trove data as a struct inside of
a mapping keyed by the trove owner's address. The storage is simple and does not
inherit any trove sorting complexity from the MUSD protocol. This approach is
scalable enough given the upper limit of troves that can be open and a fixed
term of a loan. The complexity of monitoring collateralization requirements is
moved to the off-chain bot. To make the bot's work easier, the Microloans
contract will maintain a public array with addresses of active borrowers. The
most naive bot implementation can just iterate over this array and check
collateralization and term of each active loan.

#### Upgradeability

The Microloans contract should be deployed as a transparent upgradeable proxy
with a proxy admin controlled by the Mezo Governance multisig. No extra timelock
contract is required for upgradeability.

#### Governance

The following Microloans contract parameters should be made governable:
- Issuance fee,
- Interest rate,
- The maximum term length,
- The minimum and the maximum MUSD debt,
- The minimum and maximum collateralization ratios.

The parameters are controlled by the contract owner, set to Mezo Governance,
with no extra timelock or governance delay requirements. The changes affect only
new troves, implicating that the issuance fee, interest rate, and the loan term
date need to be captured for each trove separately.

## Future Work

The capacity of the Microloans mechanism can be scaled up by allowing anyone to
provide their MUSD for lending arbitrage. 

The mechanism could be based on the
[EIP-7540](https://eips.ethereum.org/EIPS/eip-7540) vault which is a standard 
[EIP-4626](https://eips.ethereum.org/EIPS/eip-4626) vault but with async
withdrawals. As of today, the
[only audited implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/issues/4761#issuecomment-2920821035) 
is available under the commercial license and no OpenZeppelin implementation of
EIP-7540 exists.

Another option is to repurpose 
[Keep Coverage Pools](https://github.com/keep-network/coverage-pools)
implementation or provide a custom ERC-4626 vault with FIFO async withdrawals,
with a withdrawal delay of at least the loan term length. Arbiters request
withdrawals and the total sum of pending withdrawal requests is taken into
consideration when opening new micro troves and adjusting existing ones. The
fees accrued by the Microloans contract need to be tracked separately and
reflected in the amount of pool shares minted based on the MUSD provided to the
pool/vault.