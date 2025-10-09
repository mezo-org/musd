# ReversibleCallOptionManager Permissions

## Overview
The `ReversibleCallOptionManager` contract needs special permissions to call certain functions in `TroveManager` and `ActivePool` when exercising a reversible call option. Instead of modifying existing access control functions, we created new dedicated functions to maintain backward compatibility.

## Changes Made

### TroveManager.sol

**New Access Control Function Added:**
```solidity
function _requireCallerIsBorrowerOperationsOrReversibleCallOptionManager() internal view {
    require(
        msg.sender == address(borrowerOperations) ||
            msg.sender == reversibleCallOptionManagerAddress,
        "TroveManager: Caller is not the BorrowerOperations contract or ReversibleCallOptionManager"
    );
}
```

**Functions Updated to Use New Permission:**
1. `closeTrove(address _borrower)` - Now calls `_requireCallerIsBorrowerOperationsOrReversibleCallOptionManager()`
2. `removeStake(address _borrower)` - Now calls `_requireCallerIsBorrowerOperationsOrReversibleCallOptionManager()`

**Why These Functions?**
- `removeStake()` - Removes the borrower's stake from the system when the trove is being closed via option exercise
- `closeTrove()` - Sets the trove status to closed after the option supporter takes over the position

### ActivePool.sol

**New Access Control Function Added:**
```solidity
function _requireCallerIsBOorTroveMorSPorReversibleCallOptionManager() internal view {
    require(
        msg.sender == borrowerOperationsAddress ||
            msg.sender == troveManagerAddress ||
            msg.sender == stabilityPoolAddress ||
            msg.sender == reversibleCallOptionManagerAddress,
        "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool nor ReversibleCallOptionManager"
    );
}
```

**Functions Updated to Use New Permission:**
1. `decreaseDebt(uint256 _principal, uint256 _interest)` - Now calls `_requireCallerIsBOorTroveMorSPorReversibleCallOptionManager()`
2. `sendCollateral(address _account, uint256 _amount)` - Now calls `_requireCallerIsBOorTroveMorSPorReversibleCallOptionManager()`

**Why These Functions?**
- `decreaseDebt()` - Decreases the active pool's debt when the option supporter pays off the borrower's debt
- `sendCollateral()` - Transfers the trove's collateral to the option supporter after exercise

## Design Rationale

### Why Create New Functions Instead of Modifying Existing Ones?

1. **Backward Compatibility**: Existing require functions are used by multiple other functions in the contract. Modifying them could have unintended side effects.

2. **Explicit Intent**: Having separate functions makes it clear which operations are specifically allowed for the ReversibleCallOptionManager, making the code more maintainable.

3. **Security**: By creating new functions, we can carefully control exactly which operations the ReversibleCallOptionManager can perform without accidentally granting broader permissions.

4. **Auditing**: Separate functions make it easier to audit and understand the permission model, as you can see at a glance which functions have special permissions for the ReversibleCallOptionManager.

## Security Considerations

- The `reversibleCallOptionManagerAddress` must be set correctly in both contracts' `setAddresses()` functions
- Only these specific functions can be called by the ReversibleCallOptionManager:
  - `TroveManager.closeTrove()`
  - `TroveManager.removeStake()`
  - `ActivePool.decreaseDebt()`
  - `ActivePool.sendCollateral()`
- All other functions maintain their original access control restrictions

## Exercise Flow with Permissions

When a supporter exercises a reversible call option:

1. **ReversibleCallOptionManager.exercise()** is called
2. It calls `musdToken.burn()` to burn the supporter's mUSD (requires burn permission)
3. It calls `activePool.decreaseDebt()` to decrease the debt ✅ (now permitted)
4. It calls `troveManager.removeStake()` to remove the borrower's stake ✅ (now permitted)
5. It calls `troveManager.closeTrove()` to close the trove ✅ (now permitted)
6. It calls `musdToken.burn()` again to burn gas compensation from gas pool
7. It calls `activePool.sendCollateral()` to transfer collateral to supporter ✅ (now permitted)

All permissions are now properly granted for the exercise flow to work correctly!

## Compilation Status

✅ Both contracts compile successfully with the new permission functions.
