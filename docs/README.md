# Mezo USD

mUSD is a stablecoin that is minted by creating a loan against the borrowers crytpo assets, this is known as a Collateralised Debt Position (CDP).

mUSD is based on [Threshold USD](https://github.com/Threshold-USD/dev) which is a fork of [Liquity](https://github.com/liquity/dev) for the [Mezo Network](https://mezo.org).

## Core Ideas

### Immutability

To give borrowers certainty the deployed contracts are immutable. However at some point in the future if the price feeds no longer work the price feed logic will fail.

- Sets of immutable contracts are deployed together for different versions or collaterals.
- The mintlist in the mUSD Token contract is used to sunset contracts if a new version is deployed by preventing any new debt positions from being opened. However the contracts will continue to function.
- There is a governance delay to make changes to the mint list.
- There is a governance delay to deploy new sets of contracts.

The tradeoffs between immutability and upgradability are explored [here](https://medium.com/@ben_longstaff/threshold-usd-token-design-trade-offs-2926087d31c4).

The three main contracts - `BorrowerOperations.sol`, `TroveManager.sol` and `StabilityPool.sol` - hold the user-facing public functions, and contain most of the internal system logic. Together they control Trove state updates and movements of collateral and mUSD tokens around the system.

### Fixed-Interest Borrowing

1. **Global Interest Rate**: A single global interest rate, referred to as the "current rate," applies to all newly opened troves.

2. **Maintaining Interest Rates**: Once a trove is opened, it retains the interest rate at which it was created, even if the global rate changes. The interest rate on a trove can only be updated by the user through the `refinance` function.

3. **Refinance Function**: The `refinance` function allows users to adjust their trove's debt to the new global interest rate. This process incurs a refinancing fee, which is a configurable percentage of the issuance fee. Refinancing offers users the advantage of avoiding collateral movement while incurring lower fees compared to closing and reopening a trove at the updated rate.

4. **Simple Interest**: Interest is calculated using a simple interest model rather than a compounding one.

5. **Interest Payments**: Interest payments are directed to the PCV (Protocol Controlled Value). The allocation of these payments is governed and can be split between an arbitrary recipient and repayment of the bootstrap loan.

6. **Additional Details**: For further information, refer to [simpleInterest.md](simpleInterest.md).

### Governance and Upgradability

1. **Governance Control**: The interest rate and other critical parameters are controlled by governance. Changes to these parameters require a governance proposal and a minimum delay before they can be enacted.

2. **Interest Rate Proposals**: New interest rates can be proposed by governance. These proposals must be approved after a minimum delay to ensure stability and predictability.

### Core Smart Contracts

`MUSD.sol` - the stablecoin token contract, which implements the ERC20 fungible token standard in conjunction with EIP-2612 and a mechanism that blocks (accidental) transfers to addresses like the StabilityPool and address(0) that are not supposed to receive funds through direct transfers. The contract mints, burns and transfers mUSD tokens.

`BorrowerOperations.sol` - contains the basic operations by which borrowers interact with their Trove: Trove creation, collateral top-up / withdrawal, stablecoin issuance and repayment. BorrowerOperations functions call in to TroveManager, telling it to update Trove state, where necessary. BorrowerOperations functions also call in to the various Pools, telling them to move collateral/Tokens between Pools or between Pool <> user, where necessary.

`InterestRateManager.sol` - handles operations for setting interest rates as well as interest related calculations.

`PriceFeed.sol` - provides price data for collateralization calculations.

`TroveManager.sol` - contains functionality for liquidations and redemptions. Also contains the state of each Trove - i.e. a record of the Trove’s collateral and debt. TroveManager does not hold value (i.e. collateral / other tokens). TroveManager functions call in to the various Pools to tell them to move collateral/tokens between Pools, where necessary.

`SortedTroves.sol` - Maintains a sorted list of Troves by Individual Collateral Ratio (ICR).

`StabilityPool.sol` - contains functionality for Stability Pool operations: making deposits, and withdrawing compounded deposits and accumulated collateral gains. Holds the mUSD Stability Pool deposits, and the collateral gains for depositors, from liquidations.

### mUSD Token - `MUSD.sol`

`startRevokeMintList(address _account)`: This function initiates the process of revoking a borrower operations contract's capability to mint new tokens. It first validates that the address provided in `_account` parameter is included in the `mintList`. Once verified, the function initializes the revocation process by updating `revokeMintListInitiated` with the current block timestamp and `pendingRevokedMintAddress` with the address passed in `_account` parameter.

`cancelRevokeMintList()`: It cancels the existing revoking mint process. The function first validates whether the `pendingRevokedMintAddress` is non-zero to confirm the presence of an ongoing pending revoking process. Once verified, it resets both `revokeMintListInitiated` and `pendingRevokedMintAddress` to zero and `address(0)` respectively, effectively finalizing the existing revoking process.

`finalizeRevokeMintList()`: This function revokes the minting capability to the borrower operations contract, previously designated in the `pendingRevokedMintAddress`. It executes only after the governance delay has elapsed following the `revokeMintListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingRevokedMintAddress` and `revokeMintListInitiated`.

`startAddMintList(address _account)`: This function initiates the process of adding a borrower operations contract's capability to mint new tokens. It first validates that the address provided in `_account` parameter isn't included in the `mintList`. Once verified, the function initializes the adding process by updating `addMintListInitiated` with the current block timestamp and `pendingAddedMintAddress` with the address passed in `_account` parameter.

`cancelAddMintList()`: It cancels the existing adding mint process. The function first validates whether the `addMintListInitiated` is non-zero to confirm the presence of an ongoing pending adding mint capability process. Once verified, it resets both `addMintListInitiated` and `pendingAddedMintAddress` to zero and `address(0)` respectively. Effectively finalizing the existing revoking process.

`finalizeAddMintList()`: This function adds the minting capability to the borrower operations contract, previously designated in the `pendingAddedMintAddress`. It executes only after the governance delay has elapsed following the `addMintListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingAddedMintAddress` and `addMintListInitiated`.

`startAddContracts(address _troveManagerAddress, address _stabilityPoolAddress, address _borrowerOperationsAddress, address _interestRateManagerAddress)`: This function initiates the process of integrating borrower operations, trove manager, stability pool, and interest rate manager contracts, enabling them to mint and burn mUSD tokens. 

`cancelAddContracts()`: This function terminates the current process of adding contracts. 

`finalizeAddContracts()`: This function adds the minting and burning capabilities to the borrower operations, trove manager, interest rate manager, and stability pool contracts previously designated in the `pendingBorrowerOperations`, `pendingStabilityPool`, `pendingInterestRateManager`, and `pendingTroveManager`. It executes only after the governance delay has elapsed following the `addContractsInitiated` timestamp. 

`startRevokeBurnList(address _account)`: This function initiates the process of revoking a contract's capability to burn mUSD tokens. 

`cancelRevokeBurnList()`: Cancels the existing revoking mint process. 

`finalizeRevokeBurnList()`: This function revokes the minting capability from a contract, previously designated in the `pendingRevokedBurnAddress`. It executes only after the governance delay has elapsed following the `revokeBurnListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingRevokedBurnAddress` and `revokeBurnListInitiated`.

### Borrower Operations - `BorrowerOperations.sol`

`openTrove(uint _maxFeePercentage, uint _MUSDAmount, address _upperHint, address _lowerHint)`: payable function that creates a Trove for the caller with the requested debt, and the collateral received. Successful execution is conditional mainly on the resulting collateralization ratio which must exceed the minimum (110% in Normal Mode, 150% in Recovery Mode). In addition to the requested debt, extra debt is issued to pay the issuance fee, and cover the gas compensation. The borrower has to provide a `_maxFeePercentage` that they are willing to accept in case of a fee slippage, i.e. when a redemption transaction is processed first, driving up the issuance fee.

`addColl(address _upperHint, address _lowerHint))`: payable function that adds the received collateral to the caller's active Trove.

`withdrawColl(uint _amount, address _upperHint, address _lowerHint)`: withdraws `_amount` of collateral from the caller’s Trove. Executes only if the user has an active Trove, the withdrawal would not pull the user’s Trove below the minimum collateralization ratio, and the resulting total collateralization ratio of the system is above 150%.

`withdrawMUSD(uint _maxFeePercentage, uint _amount, address _upperHint, address _lowerHint)`: issues `_amount` of mUSD from the caller’s Trove to the caller. Executes only if the Trove's collateralization ratio would remain above the minimum, and the resulting total collateralization ratio is above 150%. The borrower has to provide a `_maxFeePercentage` that they are willing to accept in case of a fee slippage, i.e. when a redemption transaction is processed first, driving up the issuance fee.

`repayMUSD(uint _amount, address _upperHint, address _lowerHint)`: repay `_amount` of mUSD to the caller’s Trove, subject to leaving enough debt in the Trove for gas compensation.

`adjustTrove(address _borrower, uint _collWithdrawal, uint _debtChange, bool _isDebtIncrease, address _upperHint, address _lowerHint, uint _maxFeePercentage)`: enables a borrower to simultaneously change both their collateral and debt, subject to all the restrictions that apply to individual increases/decreases of each quantity with the following particularity: if the adjustment reduces the collateralization ratio of the Trove, the function only executes if the resulting total collateralization ratio is above 150%. The borrower has to provide a `_maxFeePercentage` that they are willing to accept in case of a fee slippage, i.e. when a redemption transaction is processed first, driving up the issuance fee. The parameter is ignored if the debt is not increased with the transaction.

`closeTrove()`: allows a borrower to repay all debt, withdraw all their collateral, and close their Trove. Requires the borrower have an mUSD balance sufficient to repay their Trove's debt, excluding gas compensation - i.e. `(debt - MUSD_GAS_COMPENSATION)` mUSD.

`claimCollateral(address _user)`: when a borrower’s Trove has been fully redeemed from and closed, or liquidated in Recovery Mode with a collateralization ratio above 110%, this function allows the borrower to claim their collateral surplus that remains in the system (collateral - debt upon redemption; collateral - 110% of the debt upon liquidation).

`refinance(uint _maxFeePercentage)`: allows a borrower to move their debt to a new (presumably lower) interest rate.  In addition to the original debt, extra debt is issued to pay the refinancing fee.  The borrower has to provide a `_maxFeePercentage` that they are willing to accept in case of a fee slippage, i.e. when a redemption transaction is processed first, driving up the refinancing fee.

### TroveManager Functions - `TroveManager.sol`

`liquidate(address _borrower)`: callable by anyone, attempts to liquidate the Trove of `_user`. Executes successfully if `_user`’s Trove meets the conditions for liquidation (e.g. in Normal Mode, it liquidates if the Trove's ICR < the system MCR).

`batchLiquidateTroves(address[] calldata _troveArray)`: callable by anyone, accepts a custom list of Troves addresses as an argument. Steps through the provided list and attempts to liquidate every Trove, until it reaches the end or it runs out of gas. A Trove is liquidated only if it meets the conditions for liquidation. For a batch of 10 Troves, the gas costs per liquidated Trove are roughly between 75K-83K, for a batch of 50 Troves between 54K-69K.

`redeemCollateral(uint _MUSDAmount, address _firstRedemptionHint, address _upperPartialRedemptionHint, address _lowerPartialRedemptionHint, uint _partialRedemptionHintNICR, uint _maxIterations, uint _maxFeePercentage)`: redeems `_MUSDamount` of stablecoins for ether from the system. Decreases the caller’s mUSD balance, and sends them the corresponding amount of collateral. Executes successfully if the caller has sufficient mUSD to redeem. The number of Troves redeemed from is capped by `_maxIterations`. The borrower has to provide a `_maxFeePercentage` that they are willing to accept in case of a fee slippage, i.e. when another redemption transaction is processed first, driving up the redemption fee.

`getCurrentICR(address _user, uint _price)`: computes the user’s individual collateralization ratio (ICR) based on their total collateral and total mUSD debt. Returns 2^256 -1 if they have 0 debt.

`getTroveOwnersCount()`: get the number of active Troves in the system.

`getPendingCollateral(address _borrower)`: get the pending collateral from liquidation redistribution events, for the given Trove.

`getPendingDebt(address _borrower)`: get the pending Trove debt (i.e. the amount of extra debt assigned to the Trove) from liquidation redistribution events.

`getEntireDebtAndColl(address _borrower)`: returns a Trove’s entire debt and collateral, which respectively include any pending debt rewards and collateral rewards from prior redistributions.

`getEntireSystemColl()`: Returns the systemic entire collateral allocated to Troves, i.e. the sum of the collateral in the Active Pool and the Default Pool.

`getEntireSystemDebt()` Returns the systemic entire debt assigned to Troves, i.e. the sum of the MUSDDebt in the Active Pool and the Default Pool.

`getTCR()`: returns the total collateralization ratio (TCR) of the system. The TCR is based on the entire system debt and collateral (including pending rewards).

`checkRecoveryMode()`: reveals whether the system is in Recovery Mode (i.e. whether the Total Collateralization Ratio (TCR) is below the Critical Collateralization Ratio (CCR)).

## Definitions

_**Trove:**_ a collateralized debt position, bound to a single Ethereum address. Also referred to as a “CDP” in similar protocols.

_**Active collateral:**_ the amount of collateral recorded on a Trove’s struct

_**Active principal:**_ the amount of mUSD debt recorded on a Trove’s struct, not including any interest

_**Active interest:**_: the amount of mUSD interest recorded on a Trove's struct

_**Active debt:**_ the amount of mUSD debt recorded on a Trove’s struct (active principal plus active interest)

_**Entire collateral:**_ the sum of a Trove’s active collateral plus its pending collateral rewards accumulated from distributions

_**Entire debt:**_ the sum of a Trove’s active debt plus its pending debt rewards accumulated from distributions

_**Individual collateralization ratio (ICR):**_ a Trove's ICR is the ratio of the dollar value of its entire collateral at the current collateral:USD price, to its entire debt

_**Nominal collateralization ratio (nominal ICR, NICR):**_ a Trove's nominal ICR is its entire collateral (in collateral) multiplied by 100e18 and divided by its entire debt.

_**Entire system collateral:**_ the sum of the collateral in the ActivePool and DefaultPool

_**Entire system debt:**_ the sum of the debt in the ActivePool and DefaultPool

_**Total collateralization ratio (TCR):**_ the ratio of the dollar value of the entire system collateral at the current collateral:USD price, to the entire system debt

_**Critical collateralization ratio (CCR):**_ 150%. When the TCR is below the CCR, the system enters Recovery Mode.

_**Redemption:**_ the act of swapping mUSD tokens with the system, in return for an equivalent value of collateral. Any account with an mUSD token balance may redeem them, regardless of whether they are a borrower. 

_**Liquidation:**_ the act of force-closing an undercollateralized Trove and redistributing its collateral and debt. When the Stability Pool is sufficiently large, the liquidated debt is offset with the Stability Pool, and the collateral distributed to depositors. If the liquidated debt can not be offset with the Pool, the system redistributes the liquidated collateral and debt directly to the active Troves with >110% collateralization ratio.

Liquidation functionality is permissionless and publically available - anyone may liquidate an undercollateralized Trove, or batch liquidate Troves in ascending order of collateralization ratio.

_**Collateral Surplus:**_ The difference between the dollar value of a Troves's collateral, and the dollar value of its mUSD debt. In a full liquidation, this is the net gain earned by the recipients of the liquidation.

_**Offset:**_ cancellation of liquidated debt with mUSD in the Stability Pool, and assignment of liquidated collateral to Stability Pool depositors, in proportion to their deposit.

_**Gas compensation:**_ A refund, in mUSD and collateral, automatically paid to the caller of a liquidation function, intended to at least cover the gas cost of the transaction. Designed to ensure that liquidators are not dissuaded by potentially high gas costs.
