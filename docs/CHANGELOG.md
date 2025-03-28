# Changelog for Frontend Developers

This changelog covers the differences from the 0.1.0 release to matsnet (https://github.com/mezo-org/musd/releases/tag/v0.1.0)
and the current state as of https://github.com/mezo-org/musd/commit/0c4b3e42c903e1a4602e473e6c1ddd446f20fc4e.  This
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

2. **Upgradeable Contract Pattern**
    - Contract addresses remain the same after upgrades
    - No need to update contract addresses in your frontend

3. **Asset Amount Parameter**
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
- Removed (fees are now fixed).  Please use `getBorrowingFee` instead.

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

#### Integration Notes for Frontend Developers

1. **Fixed Fee Structure**
   - Borrowing and redemption fees are now fixed rather than variable

2. **Upgradeable Contract Pattern**
   - Contract addresses remain the same after upgrades
   - No need to update contract addresses in your frontend

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