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
