# Mezo USD

MUSD is a stablecoin that is minted by creating a loan against the borrowers crytpo assets, this is known as a Collateralised Debt Position (CDP).

MUSD v0 is based on [Threshold USD](https://github.com/Threshold-USD/dev) which is a fork of [Liquity](https://github.com/liquity/dev) for the [Mezo Network](https://mezo.org).

## Core Ideas

To give borrowers certainty the deployed contracts are immutable. However at some point in the future if the price feeds no longer work the price feed logic will fail.

- Sets of immutable contracts are deployed together for different versions or collaterals.
- The mintlist in the MUSD Token contract is used to sunset contracts if a new version is deployed by preventing any new debt positions from being opened. However the contracts will continue to function.
- There is a governance delay to make changes to the mint list.
- There is a governance delay to deploy new sets of contracts.

The tradeoffs between immutability and upgradability are explored [here](https://medium.com/@ben_longstaff/threshold-usd-token-design-trade-offs-2926087d31c4).

The three main contracts - `BorrowerOperations.sol`, `TroveManager.sol` and `StabilityPool.sol` - hold the user-facing public functions, and contain most of the internal system logic. Together they control Trove state updates and movements of collateral and MUSD tokens around the system.

### Core Smart Contracts

`MUSD.sol` - the stablecoin token contract, which implements the ERC20 fungible token standard in conjunction with EIP-2612 and a mechanism that blocks (accidental) transfers to addresses like the StabilityPool and address(0) that are not supposed to receive funds through direct transfers. The contract mints, burns and transfers MUSD tokens.

`BorrowerOperations.sol` - contains the basic operations by which borrowers interact with their Trove: Trove creation, collateral top-up / withdrawal, stablecoin issuance and repayment. BorrowerOperations functions call in to TroveManager, telling it to update Trove state, where necessary. BorrowerOperations functions also call in to the various Pools, telling them to move collateral/Tokens between Pools or between Pool <> user, where necessary.

`TroveManager.sol` - contains functionality for liquidations and redemptions. Also contains the state of each Trove - i.e. a record of the Trove’s collateral and debt. TroveManager does not hold value (i.e. collateral / other tokens). TroveManager functions call in to the various Pools to tell them to move collateral/tokens between Pools, where necessary.

`StabilityPool.sol` - contains functionality for Stability Pool operations: making deposits, and withdrawing compounded deposits and accumulated collateral gains. Holds the MUSD Stability Pool deposits, and the collateral gains for depositors, from liquidations.

### MUSD Token - `MUSD.sol`

`startRevokeMintList(address _account)`: This function initiates the process of revoking a borrower operations contract's capability to mint new tokens. It first validates that the address provided in `_account` parameter is included in the `mintList`. Once verified, the function initializes the revocation process by updating `revokeMintListInitiated` with the current block timestamp and `pendingRevokedMintAddress` with the address passed in `_account` parameter.

`cancelRevokeMintList()`: It cancels the existing revoking mint process. The function first validates whether the `pendingRevokedMintAddress` is non-zero to confirm the presence of an ongoing pending revoking process. Once verified, it resets both `revokeMintListInitiated` and `pendingRevokedMintAddress` to zero and `address(0)` respectively, effectively finalizing the existing revoking process.

`finalizeRevokeMintList()`: This function revokes the minting capability to the borrower operations contract, previously designated in the `pendingRevokedMintAddress`. It executes only after the governance delay has elapsed following the `revokeMintListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingRevokedMintAddress` and `revokeMintListInitiated`.

`startAddMintList(address _account)`: This function initiates the process of adding a borrower operations contract's capability to mint new tokens. It first validates that the address provided in `_account` parameter isn't included in the `mintList`. Once verified, the function initializes the adding process by updating `addMintListInitiated` with the current block timestamp and `pendingAddedMintAddress` with the address passed in `_account` parameter.

`cancelAddMintList()`: It cancels the existing adding mint process. The function first validates whether the `addMintListInitiated` is non-zero to confirm the presence of an ongoing pending adding mint capability process. Once verified, it resets both `addMintListInitiated` and `pendingAddedMintAddress` to zero and `address(0)` respectively. Effectively finalizing the existing revoking process.

`finalizeAddMintList()`: This function adds the minting capability to the borrower operations contract, previously designated in the `pendingAddedMintAddress`. It executes only after the governance delay has elapsed following the `addMintListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingAddedMintAddress` and `addMintListInitiated`.

`startAddContracts(address _troveManagerAddress, address _stabilityPoolAddress, address _borrowerOperationsAddress)`: This function initiates the process of integrating borrower operations, trove manager, and stability pool contracts, enabling them to mint and burn MUSD tokens. It begins by verifying that the contract addresses provided as parameters are indeed contracts. Once confirmed, it assigns the addresses to `pendingTroveManager`, `pendingStabilityPool`, and `pendingBorrowerOperations` using `_troveManagerAddress`, `_stabilityPoolAddress`, and `_borrowerOperationsAddress`, respectively. Additionally, it records the initiation of adding these contracts by setting `addContractsInitiated` to the current block timestamp when the transaction is executed.

`cancelAddContracts()`: This function terminates the current process of adding contracts. Initially, it checks that `addContractsInitiated` is not zero, which indicates an active process of adding contracts is underway. Upon confirmation, it resets `addContractsInitiated`, `pendingTroveManager`, `pendingStabilityPool`, and `pendingRevokedMintAddress` to 0, `address(0)`, `address(0)`, and `address(0)` respectively. This action effectively concludes the process of adding contracts.

`finalizeAddContracts()`: This function adds the minting and burning capabilities to the borrower operations, trove manager, and stability pool contracts previously designated in the `pendingBorrowerOperations`, `pendingStabilityPool` and `pendingTroveManager`. It executes only after the governance delay has elapsed following the `addContractsInitiated` timestamp. By finalizing the process of adding new contracts, it resets the `pendingBorrowerOperations`, `pendingStabilityPool`,`pendingTroveManager` and `addContractsInitiated`.

`startRevokeBurnList(address _account)`: This function initiates the process of revoking a borrower operations contract's capability to burn MUSD tokens. It first validates that the address provided in `_account` parameter is included in the `burnList`. Once verified, the function initializes the revocation process by updating `revokeBurnListInitiated` with the current block timestamp and `pendingRevokedBurnAddress` with the address passed in `_account` parameter.

`cancelRevokeBurnList()`: It cancels the existing revoking mint process. The function first validates whether the `pendingRevokedBurnAddress` is non-zero to confirm the presence of an ongoing pending revoking process. Once verified, it resets both `revokeBurnListInitiated` and `pendingRevokedBurnAddress` to zero and `address(0)` respectively. Effectively finalizing the existing revoking process.

`finalizeRevokeBurnList()`: This function revokes the minting capability to the borrower operations contract, previously designated in the `pendingRevokedBurnAddress`. It executes only after the governance delay has elapsed following the `revokeBurnListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingRevokedBurnAddress` and `revokeBurnListInitiated`.

### TroveManager Functions - `TroveManager.sol`

`liquidate(address _borrower)`: callable by anyone, attempts to liquidate the Trove of `_user`. Executes successfully if `_user`’s Trove meets the conditions for liquidation (e.g. in Normal Mode, it liquidates if the Trove's ICR < the system MCR).

`liquidateTroves(uint n)`: callable by anyone, checks for under-collateralized Troves below MCR and liquidates up to `n`, starting from the Trove with the lowest collateralization ratio; subject to gas constraints and the actual number of under-collateralized Troves. The gas costs of `liquidateTroves(uint n)` mainly depend on the number of Troves that are liquidated, and whether the Troves are offset against the Stability Pool or redistributed. For n=1, the gas costs per liquidated Trove are roughly between 215K-400K, for n=5 between 80K-115K, for n=10 between 70K-82K, and for n=50 between 60K-65K.

`batchLiquidateTroves(address[] calldata _troveArray)`: callable by anyone, accepts a custom list of Troves addresses as an argument. Steps through the provided list and attempts to liquidate every Trove, until it reaches the end or it runs out of gas. A Trove is liquidated only if it meets the conditions for liquidation. For a batch of 10 Troves, the gas costs per liquidated Trove are roughly between 75K-83K, for a batch of 50 Troves between 54K-69K.

`redeemCollateral(uint _MUSDAmount, address _firstRedemptionHint, address _upperPartialRedemptionHint, address _lowerPartialRedemptionHint, uint _partialRedemptionHintNICR, uint _maxIterations, uint _maxFeePercentage)`: redeems `_MUSDamount` of stablecoins for ether from the system. Decreases the caller’s MUSD balance, and sends them the corresponding amount of collateral. Executes successfully if the caller has sufficient MUSD to redeem. The number of Troves redeemed from is capped by `_maxIterations`. The borrower has to provide a `_maxFeePercentage` that he/she is willing to accept in case of a fee slippage, i.e. when another redemption transaction is processed first, driving up the redemption fee.

`getCurrentICR(address _user, uint _price)`: computes the user’s individual collateralization ratio (ICR) based on their total collateral and total MUSD debt. Returns 2^256 -1 if they have 0 debt.

`getTroveOwnersCount()`: get the number of active Troves in the system.

`getPendingETHReward(address _borrower)`: get the pending collateral reward from liquidation redistribution events, for the given Trove.

`getPendingMUSDDebtReward(address _borrower)`: get the pending Trove debt "reward" (i.e. the amount of extra debt assigned to the Trove) from liquidation redistribution events.

`getEntireDebtAndColl(address _borrower)`: returns a Trove’s entire debt and collateral, which respectively include any pending debt rewards and collateral rewards from prior redistributions.

`getEntireSystemColl()`:  Returns the systemic entire collateral allocated to Troves, i.e. the sum of the collateral in the Active Pool and the Default Pool.

`getEntireSystemDebt()` Returns the systemic entire debt assigned to Troves, i.e. the sum of the MUSDDebt in the Active Pool and the Default Pool.

`getTCR()`: returns the total collateralization ratio (TCR) of the system.  The TCR is based on the entire system debt and collateral (including pending rewards).

`checkRecoveryMode()`: reveals whether the system is in Recovery Mode (i.e. whether the Total Collateralization Ratio (TCR) is below the Critical Collateralization Ratio (CCR)).

## Definitions

_**Trove:**_ a collateralized debt position, bound to a single Ethereum address. Also referred to as a “CDP” in similar protocols.

_**Individual collateralization ratio (ICR):**_ a Trove's ICR is the ratio of the dollar value of its entire collateral at the current collateral:USD price, to its entire debt

_**Total collateralization ratio (TCR):**_ the ratio of the dollar value of the entire system collateral at the current collateral:USD price, to the entire system debt

_**Critical collateralization ratio (CCR):**_ 150%. When the TCR is below the CCR, the system enters Recovery Mode.

_**Gas compensation:**_ A refund, in MUSD and collateral, automatically paid to the caller of a liquidation function, intended to at least cover the gas cost of the transaction. Designed to ensure that liquidators are not dissuaded by potentially high gas costs.
