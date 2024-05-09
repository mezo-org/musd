# Mezo USD

MUSD is a stablecoin that is minted by creating a loan against the borrowers crytpo assets, this is known as a Collateralised Debt Position (CDP).

MUSD v0 is based on [Threshold USD](https://github.com/Threshold-USD/dev/tree/thUSD) which is a fork of [Liquity](https://github.com/liquity/dev) for the [Mezo Network](https://mezo.org).

## Core Ideas

To give borrowers certainty the deployed contracts are immutable. However at some point in the future if the price feeds no longer work the price feed logic will fail.

- Sets of immutable contracts are deployed together for different versions or collaterals.
- The mintlist in the MUSD Token contract is used to sunset contracts if a new version is deployed by preventing any new debt positions from being opened. However the contracts will continue to function.
- There is a governance delay to make changes to the mint list.
- There is a governance delay to deploy new sets of contracts.

The tradeoffs between immutability and upgradability are explored [here](https://medium.com/@ben_longstaff/threshold-usd-token-design-trade-offs-2926087d31c4).

The three main contracts - `BorrowerOperations.sol`, `TroveManager.sol` and `StabilityPool.sol` - hold the user-facing public functions, and contain most of the internal system logic. Together they control Vault state updates and movements of collateral and MUSD tokens around the system.

### Core Smart Contracts

`MUSD.sol` - the stablecoin token contract, which implements the ERC20 fungible token standard in conjunction with EIP-2612 and a mechanism that blocks (accidental) transfers to addresses like the StabilityPool and address(0) that are not supposed to receive funds through direct transfers. The contract mints, burns and transfers MUSD tokens.

`BorrowerOperations.sol` - contains the basic operations by which borrowers interact with their Vault: Vault creation, collateral top-up / withdrawal, stablecoin issuance and repayment. BorrowerOperations functions call in to TroveManager, telling it to update Vault state, where necessary. BorrowerOperations functions also call in to the various Pools, telling them to move collateral/Tokens between Pools or between Pool <> user, where necessary.

`TroveManager.sol` - contains functionality for liquidations and redemptions. Also contains the state of each Vault - i.e. a record of the Vault’s collateral and debt. TroveManager does not hold value (i.e. collateral / other tokens). TroveManager functions call in to the various Pools to tell them to move collateral/tokens between Pools, where necessary.

`StabilityPool.sol` - contains functionality for Stability Pool operations: making deposits, and withdrawing compounded deposits and accumulated collateral gains. Holds the MUSD Stability Pool deposits, and the collateral gains for depositors, from liquidations.

### MUSD Token - `MUSD.sol`

`startRevokeMintList(address _account)`: This function initiates the process of revoking a borrower operations contract's capability to mint new tokens. It first validates that the address provided in `_account` parameter is included in the `mintList`. Once verified, the function initializes the revocation process by updating `revokeMintListInitiated` with the current block timestamp and `pendingRevokedMintAddress` with the address passed in `_account` parameter.

`cancelRevokeMintList()`: It cancels the existing revoking mint process. The function first validates whether the `pendingRevokedMintAddress` is non-zero to confirm the presence of an ongoing pending revoking process. Once verified, it resets both `revokeMintListInitiated` and `pendingRevokedMintAddress` to zero and `address(0)` respectively. Effectively finalizing the existing revoking process.

`finalizeRevokeMintList()`: This function revokes the minting capability to the borrower operations contract, previously designated in the `pendingRevokedMintAddress`. It executes only after the governance delay has elapsed following the `revokeMintListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingRevokedMintAddress` and `revokeMintListInitiated`.

`startAddMintList(address _account)`: This function initiates the process of adding a borrower operations contract's capability to mint new tokens. It first validates that the address provided in `_account` parameter isn't included in the `mintList`. Once verified, the function initializes the adding process by updating `addMintListInitiated` with the current block timestamp and `pendingAddedMintAddress` with the address passed in `_account` parameter.

`cancelAddMintList()`: It cancels the existing adding mint process. The function first validates whether the `addMintListInitiated` is non-zero to confirm the presence of an ongoing pending adding mint capability process. Once verified, it resets both `addMintListInitiated` and `pendingAddedMintAddress` to zero and `address(0)` respectively. Effectively finalizing the existing revoking process.

`finalizeAddMintList()`: This function adds the minting capability to the borrower operations contract, previously designated in the `pendingAddedMintAddress`. It executes only after the governance delay has elapsed following the `addMintListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingAddedMintAddress` and `addMintListInitiated`.

`startAddContracts(address _troveManagerAddress, address _stabilityPoolAddress, address _borrowerOperationsAddress)`: This function initiates the process of integrating borrower operations, trove manager, and stability pool contracts, enabling them to mint and burn MUSD tokens. It begins by verifying that the contract addresses provided as parameters are indeed contracts. Once confirmed, it assigns the addresses to p`endingTroveManager`, `pendingStabilityPool`, and `pendingBorrowerOperations` using `_troveManagerAddress`, `_stabilityPoolAddress`, and `_borrowerOperationsAddress`, respectively. Additionally, it records the initiation of adding these contracts by setting `addContractsInitiated` to the current block timestamp when the transaction is executed.

`cancelAddContracts()`: This function terminates the current process of adding contracts. Initially, it checks that `addContractsInitiated` is not zero, which indicates an active process of adding contracts is underway. Upon confirmation, it resets `addContractsInitiated`, `pendingTroveManager`, `pendingStabilityPool`, and `pendingRevokedMintAddress` to 0, `address(0)`, `address(0)`, and `address(0)` respectively. This action effectively concludes the process of adding contracts.

`finalizeAddContracts()`: This function adds the minting and burning capabilities to the borrower operations, trove manager, and stability pool contracts previously designated in the `pendingBorrowerOperations`, `pendingStabilityPool` and `pendingTroveManager`. It executes only after the governance delay has elapsed following the `addContractsInitiated` timestamp. By finalizing the process of adding new contracts, it resets the `pendingBorrowerOperations`, `pendingStabilityPool`,`pendingTroveManager` and `addContractsInitiated`.

`startRevokeBurnList(address _account)`: This function initiates the process of revoking a borrower operations contract's capability to burn MUSD tokens. It first validates that the address provided in `_account` parameter is included in the `burnList`. Once verified, the function initializes the revocation process by updating `revokeBurnListInitiated` with the current block timestamp and `pendingRevokedBurnAddress` with the address passed in `_account` parameter.

`cancelRevokeBurnList()`: It cancels the existing revoking mint process. The function first validates whether the `pendingRevokedBurnAddress` is non-zero to confirm the presence of an ongoing pending revoking process. Once verified, it resets both `revokeBurnListInitiated` and `pendingRevokedBurnAddress` to zero and `address(0)` respectively. Effectively finalizing the existing revoking process.

`finalizeRevokeBurnList()`: This function revokes the minting capability to the borrower operations contract, previously designated in the `pendingRevokedBurnAddress`. It executes only after the governance delay has elapsed following the `revokeBurnListInitiated` timestamp. By finalizing the revoke mint process it resets the `pendingRevokedBurnAddress` and `revokeBurnListInitiated`.
