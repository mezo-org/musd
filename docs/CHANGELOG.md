# Changelog for Frontend Developers

## Changelog from [previous changelog commit] (https://github.com/mezo-org/musd/commit/0c4b3e42c903e1a4602e473e6c1ddd446f20fc4e) to [1.0.0 release] (https://github.com/mezo-org/musd/releases/tag/v1.0.0)

### Major Contract/Interface Changes

#### ActivePool
- `interestRateManagerAddress` is now `IInterestRateManager public interestRateManager`
- `getDebt()` now returns `principal + getInterest()` (was `principal + interest`)
- `getInterest()` now returns `interest + interestRateManager.getAccruedInterest()` (was just `interest`)

#### BorrowerOperations
- **New Enum Value:** `BorrowerOperation.refinanceTrove`
- **New State Variables:** `IGovernableVariables public governableVariables`, `borrowingRate`, `redemptionRate`, and their proposal/approval state
- **refinance:** Now takes `_upperHint` and `_lowerHint` as arguments
- **New Functions:**
    - `proposeBorrowingRate`, `approveBorrowingRate`, `proposeRedemptionRate`, `approveRedemptionRate`
    - `getRedemptionRate(uint256 _collateralDrawn) returns (uint256)`
    - `getBorrowingFee(uint256 _debt) returns (uint)`
- **Fee Exemption:** Borrowing fee is not charged if `governableVariables.isAccountFeeExempt(_borrower)` is true
- **Borrowing Fee Calculation:** Now uses `getBorrowingFee` (local) instead of calling TroveManager
- **Redemption Fee Calculation:** Now uses `getRedemptionRate` (local) instead of TroveManager
- **Events:** Added events for borrowing/redemption rate changes/proposals

#### BorrowerOperationsSignatures
- **refinanceWithSignature:** Now takes `_upperHint` and `_lowerHint` as arguments and passes them through

#### GovernableVariables (New Contract)
- **Governance Roles:** `council`, `treasury`, with time-delayed role changes
- **Fee Exemption:** `addFeeExemptAccount`, `removeFeeExemptAccount`, and batch versions
- **Events:** `FeeExemptAccountAdded`, `FeeExemptAccountRemoved`, `RolesSet`
- **Frontend Impact:** Frontend can now check if an account is fee-exempt

#### HintHelpers
- **getRedemptionHints:** Now skips troves with ICR < MCR

#### InterestRateManager
- **Proposal/Approval:** Proposal time variable renamed, and proposal/approval logic clarified
- **initialize:** Now sets default interest rate and proposal time

#### TroveManager
- **Redemption Fee:** Now calculated via `BorrowerOperations.getRedemptionRate` instead of internal logic
- **Borrowing Fee:** No longer exposes `getBorrowingFee` (was a pure function)
- **Redemption Loop:** Now skips troves with ICR < MCR

#### MUSD Token
- **Governance Delay:** All time-delayed governance functions removed
- **Mint/Burn List:** Now uses immediate `addToMintList`, `removeFromMintList`, `addToBurnList`, `removeFromBurnList`
- **Events:** Added events for mint/burn list changes
- **Errors:** Added custom errors for mint/burn list management

#### TokenDeployer (New)
- **deployToken:** Deploys MUSD at a deterministic address using CREATE2. Only callable by specific deployer or governance depending on chain

### Summary of Frontend-Relevant Changes
- **Fee Calculation:** Borrowing and redemption fees are now governed and can be proposed/approved by governance, with new events and proposal/approval delays
- **Fee Exemption:** Some accounts can be made fee-exempt via governance
- **Mint/Burn List:** Immediate changes, new events, and errors for UI to handle
- **Redemption/Borrowing Fee Calculation:** Now lives in `BorrowerOperations`, not `TroveManager`
- **Refinance:** Now requires hints for sorted trove insertion
- **Token Deployment:** MUSD is now deployed via a deterministic deployer contract
- **Interface Changes:** Many functions now require different arguments or have new events/errors

### Matsnet Addresses
 Contract   | Mezo Address |
|------------|--------------|
| ActivePool | 0x143A063F62340DA3A8bEA1C5642d18C6D0F7FF51 |
| BorrowerOperations | 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5 |
| BorrowerOperationsSignatures | 0xD757e3646AF370b15f32EB557F0F8380Df7D639e |
| CollSurplusPool | 0xB4C35747c26E4aB5F1a7CdC7E875B5946eFa6fa9 |
| DefaultPool | 0x59851D252090283f9367c159f0C9036e75483300 |
| GasPool | 0x8fa3EF45137C3AFF337e42f98023C1D7dd3666C0 |
| GovernableVariables | 0x6552059B6eFc6aA4AE3ea45f28ED4D92acE020cD |
| HintHelpers | 0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6 |
| InterestRateManager | 0xD4D6c36A592A2c5e86035A6bca1d57747a567f37 |
| MUSD | 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 |
| PCV | 0x4dDD70f4C603b6089c07875Be02fEdFD626b80Af |
| PriceFeed | 0x86bCF0841622a5dAC14A313a15f96A95421b9366 |
| SortedTroves | 0x722E4D24FD6Ff8b0AC679450F3D91294607268fA |
| StabilityPool | 0x1CCA7E410eE41739792eA0A24e00349Dd247680e |
| TroveManager | 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0 |

## Changelog 0.1.0 to [this commit] (https://github.com/mezo-org/musd/commit/0c4b3e42c903e1a4602e473e6c1ddd446f20fc4e)

This changelog covers the differences from the [0.1.0 release to matsnet](https://github.com/mezo-org/musd/releases/tag/v0.1.0)
and the current state as of [this commit] (https://github.com/mezo-org/musd/commit/0c4b3e42c903e1a4602e473e6c1ddd446f20fc4e). This
document is not intended to cover all changes but rather focuses on the changes that are relevant to frontend dapp development.

## API Changes in Core Contracts

### BorrowerOperations

#### Function Signature Changes

##### `openTrove`

```diff
- function openTrove(uint256 _maxFeePercentage, uint256 _debtAmount, uint256 _assetAmount, address _upperHint, address _lowerHint) external payable
+ function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) external payable
```

- Removed `_maxFeePercentage` parameter (fees are now fixed)
- Removed `_assetAmount` parameter (now uses `msg.value` directly)

##### `adjustTrove`

```diff
- function adjustTrove(uint256 _maxFeePercentage, uint256 _collWithdrawal, uint256 _debtChange, bool _isDebtIncrease, uint256 _assetAmount, address _upperHint, address _lowerHint) external payable
+ function adjustTrove(uint256 _collWithdrawal, uint256 _debtChange, bool _isDebtIncrease, address _upperHint, address _lowerHint) external payable
```

- Removed `_maxFeePercentage` parameter (fees are now fixed)
- Removed `_assetAmount` parameter (now uses `msg.value` directly)

##### `withdrawMUSD`

```diff
- function withdrawMUSD(uint256 _maxFeePercentage, uint256 _amount, address _upperHint, address _lowerHint) external
+ function withdrawMUSD(uint256 _amount, address _upperHint, address _lowerHint) external
```

- Removed `_maxFeePercentage` parameter (fees are now fixed)

##### `refinance`

```diff
- function refinance(uint256 _maxFeePercentage) external
+ function refinance() external
```

- Removed `_maxFeePercentage` parameter (fees are now fixed)

#### Contract Structure Changes

- Migrated from `Ownable` to `OwnableUpgradeable`
- Removed EIP712 implementation (moved to BorrowerOperationsSignatures)

#### Integration Notes for Frontend Developers

1. **Fee Parameter Removal**

   - Remove any UI elements or logic related to setting custom fee percentages
   - Fees are now fixed in the contract and cannot be specified per transaction

2. **Asset Amount Parameter**
   - The `_assetAmount` parameter has been removed from functions
   - The contract now uses `msg.value` directly for collateral operations

### TroveManager

#### Function Signature Changes

##### `redeemCollateral`

```diff
- function redeemCollateral(uint256 _amount, address _firstRedemptionHint, address _upperPartialRedemptionHint, address _lowerPartialRedemptionHint, uint256 _partialRedemptionHintNICR, uint256 _maxIterations, uint256 _maxFeePercentage) external override
+ function redeemCollateral(uint256 _amount, address _firstRedemptionHint, address _upperPartialRedemptionHint, address _lowerPartialRedemptionHint, uint256 _partialRedemptionHintNICR, uint256 _maxIterations) external override
```

- Removed `_maxFeePercentage` parameter (fees are now fixed)

#### `getBorrowingRateWithDecay`

- Removed (fees are now fixed). Please use `getBorrowingFee` instead.

#### `MIN_NET_DEBT`

- Changed to a variable `minNetDebt`.

#### Fee Calculation Changes

##### `getBorrowingFee`

```diff
- function getBorrowingFee(uint256 _debt) external view override returns (uint) {
-     return _calcBorrowingFee(getBorrowingRate(), _debt);
- }
+ function getBorrowingFee(uint256 _debt) external pure override returns (uint) {
+     return (_debt * BORROWING_FEE_FLOOR) / DECIMAL_PRECISION;
+ }
```

- Changed from `view` to `pure` function
- Now uses a fixed fee rate (BORROWING_FEE_FLOOR) instead of a variable rate

#### Virtual Interest Accrual

Trove-state related `view` functions now virtually accrue interest rather than using stale values from Trove structs. This means the values they return should always be up to date.

The functions affected include:

- `getCurrentICR`
- `getEntireDebtAndColl`
- `getEntireSystemDebt`
- `checkRecoveryMode`
- `getTroveDebt`

One notable exception is `getTroveInterestOwed` which returns the value recorded on the Trove struct but does not virtually accrue interest.

#### Interest Not Used for NICR Calculations

Interest is no longer used in NICR calculations for insertion into SortedTroves. This should be transparent to the front end, but it is worth noting that functions like `getNominalICR` will now reflect a collateral to principal ratio rather than collateral to total debt.

#### Integration Notes for Frontend Developers

1. **Fixed Fee Structure**
   - Borrowing and redemption rates are now fixed rather than variable

### PriceFeed

#### Integration Notes for Frontend Developers

1.  **Staleness Check**

- If the oracle has not been updated in at least 60 seconds, it is stale, and we will revert on a call to `fetchPrice`.

## Structural Changes

1. **SortedTroves Ordering**

   - Removed interest from SortedTroves ordering. The list is now ordered according to the collateral to principal ratio. Previously, this was collateral to total debt (principal + interest).
   - **Consequences for Frontend**: Trove insertions should be slightly more gas efficient. Additionally, redemptions are now more predictable as the trove that will be redeemed against is based on stable values (principal) instead of dynamically changing values (like interest).

2. **Unified Liquidations**

   - Liquidations are now the same in recovery mode and normal mode.
   - **Consequences for Frontend**: Users no longer have to worry about getting liquidated unless they fall below the MCR (110%). Previously, if the system went into recovery mode, it was possible to get liquidated at ICR < CCR (150%).

3. **BorrowerOperationsSignatures**

   - Now allows for trove operations to be called on behalf of the borrower using EIP712 signature verification.
   - **Consequences for Frontend**: This is most likely to be used by the veBTC BorrowLocker contract and likely does not have consequences for the existing frontend.

4. **OwnableUpgradeable Contracts**
   - All contracts are now OwnableUpgradeable, meaning contract addresses should remain the same after upgrades.
   - **Consequences for Frontend**: There will not be a need going forward to update contract addresses. However, the first release will involve different contract addresses, and we still need to spec out how that initial upgrade will happen.




