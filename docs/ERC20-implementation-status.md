# ERC20 Collateral Implementation Status

## Completed Components

### Pool Contracts ✅

- **ActivePoolERC20** - Fully implemented and tested
- **DefaultPoolERC20** - Fully implemented
- **CollSurplusPoolERC20** - Fully implemented
- **SendCollateralERC20** - Base contract for ERC20 transfers

### Interfaces ✅

- IPoolERC20
- IActivePoolERC20
- IDefaultPoolERC20
- ICollSurplusPoolERC20
- IBorrowerOperationsERC20

### Test Infrastructure ✅

- MockERC20 - Configurable test token
- MockContract - Dependency mocking
- ActivePoolERC20 comprehensive unit tests

## Remaining Components

### Critical Contracts (Complex - 1000+ lines each)

The following contracts require substantial implementation work due to their complexity:

#### 1. BorrowerOperationsERC20

**Status**: Interface complete, implementation needed
**Complexity**: High (1200+ lines in native version)
**Key Changes Required**:

- Remove `payable` modifiers from all functions
- Replace `msg.value` with explicit `_collAmount` parameters
- Add ERC20 `transferFrom` calls for collateral deposits
- Update `_adjustTrove` internal logic for ERC20 handling
- Modify collateral withdrawal to use ERC20 `transfer`

**Key Functions**:

- `openTrove(uint256 _collAmount, uint256 _debtAmount, ...)`
- `addColl(uint256 _collAmount, ...)`
- `withdrawColl(uint256 _amount, ...)`
- `adjustTrove(uint256 _collDeposit, uint256 _collWithdrawal, ...)`
- `closeTrove()`
- `refinance(...)`

#### 2. TroveManagerERC20

**Status**: Not started
**Complexity**: High (1500+ lines in native version)
**Key Changes Required**:

- Update liquidation logic to handle ERC20 transfers
- Modify redemption collateral distribution
- Change collateral gain calculations for ERC20
- Update all internal collateral movement functions

**Key Functions**:

- `liquidate(address _borrower)`
- `batchLiquidateTroves(address[] _troveArray)`
- `redeemCollateral(...)`
- `_movePendingTroveRewardsToActivePool(...)`

#### 3. StabilityPoolERC20

**Status**: Not started
**Complexity**: High (800+ lines in native version)
**Key Changes Required**:

- Replace `receive()` fallback with explicit `receiveCollateral()`
- Update collateral gain distribution for ERC20
- Modify liquidation offset logic
- Change depositor reward calculations

**Key Functions**:

- `provideToSP(uint256 _amount)`
- `withdrawFromSP(uint256 _amount)`
- `offset(uint _principal, uint _interest, uint _coll)`

#### 4. PCVERC20

**Status**: Not started
**Complexity**: Medium (400+ lines)
**Key Changes Required**:

- Update fee collection for ERC20
- Modify collateral withdrawal logic
- Change bootstrap loan BTC management

**Key Functions**:

- `withdrawCollateral(address _to, uint256 _amount)`
- `depositToStabilityPool(uint256 _amount)`
- `withdrawFromStabilityPool(...)`

## Implementation Approach

### Pattern for Converting Native → ERC20

#### 1. Function Signatures

**Native**:

```solidity
function openTrove(uint256 _debtAmount, ...) external payable {
    uint256 collAmount = msg.value;
    // ...
}
```

**ERC20**:

```solidity
function openTrove(uint256 _collAmount, uint256 _debtAmount, ...) external {
    IERC20(collateralToken).safeTransferFrom(msg.sender, address(activePool), _collAmount);
    activePool.receiveCollateral(_collAmount);
    // ...
}
```

#### 2. Internal Collateral Handling

**Native**:

```solidity
_sendCollateral(recipient, amount); // Uses low-level call
```

**ERC20**:

```solidity
IERC20(collateralToken).safeTransfer(recipient, amount);
// or
activePool.sendCollateral(recipient, amount); // Uses SafeERC20 internally
```

#### 3. Receiving Collateral

**Native**:

```solidity
receive() external payable {
  collateral += msg.value;
}
```

**ERC20**:

```solidity
function receiveCollateral(uint256 _amount) external {
  _requireCallerIsAuthorized();
  collateral += _amount;
  // Note: Tokens must be transferred BEFORE calling this
}
```

## Security Considerations

### ERC20-Specific Risks

1. **Approval Management**: Users must approve contracts before operations
2. **Reentrancy**: Even with SafeERC20, be cautious of token callbacks
3. **Token Validation**: Ensure the collateral token is a valid ERC20
4. **Decimal Handling**: Support tokens with 6-18 decimals properly
5. **Fee-on-Transfer Tokens**: Should be explicitly rejected or handled

### Recommended Security Measures

- Use OpenZeppelin's SafeERC20 for all transfers
- Add reentrancy guards where appropriate
- Validate token contract on deployment
- Test with various ERC20 implementations
- Consider edge cases like tokens that return false vs revert

## Testing Strategy

### Unit Tests Required

- [ ] BorrowerOperationsERC20 full test suite
- [ ] TroveManagerERC20 liquidation scenarios
- [ ] StabilityPoolERC20 deposit/withdrawal flows
- [ ] PCVERC20 fee management tests

### Integration Tests Required

- [ ] Full trove lifecycle (open → adjust → close) with ERC20
- [ ] Liquidation flow with ERC20 collateral
- [ ] Redemption flow with ERC20
- [ ] Recovery mode with ERC20
- [ ] Multi-user stability pool scenarios

### Edge Cases to Test

- [ ] Tokens with different decimals (6, 8, 18)
- [ ] Very large and very small amounts
- [ ] Dust amounts and rounding
- [ ] Token transfer failures
- [ ] Approval edge cases
- [ ] Concurrent operations

## Deployment Considerations

### Deployment Order

1. Deploy MockERC20 (or use existing ERC20 token)
2. Deploy pool contracts (ActivePoolERC20, DefaultPoolERC20, CollSurplusPoolERC20)
3. Deploy BorrowerOperationsERC20
4. Deploy TroveManagerERC20
5. Deploy StabilityPoolERC20
6. Deploy PCVERC20
7. Call `setAddresses` on each contract
8. Verify all connections

### Configuration Parameters

- `collateralToken`: Address of ERC20 token to use as collateral
- All other parameters same as native version (MCR, CCR, fees, etc.)

## Estimated Effort

| Component               | Complexity | Estimated Lines | Time Estimate  |
| ----------------------- | ---------- | --------------- | -------------- |
| BorrowerOperationsERC20 | High       | 1200+           | 2-3 days       |
| TroveManagerERC20       | High       | 1500+           | 3-4 days       |
| StabilityPoolERC20      | High       | 800+            | 2-3 days       |
| PCVERC20                | Medium     | 400+            | 1-2 days       |
| Comprehensive Tests     | High       | 2000+           | 3-4 days       |
| **Total**               |            | **~6000 lines** | **11-16 days** |

## Next Steps

1. **Implement BorrowerOperationsERC20** (highest priority - main user interface)
2. **Implement TroveManagerERC20** (required for liquidations/redemptions)
3. **Implement StabilityPoolERC20** (required for liquidation absorption)
4. **Implement PCVERC20** (required for fee management)
5. **Create comprehensive integration tests**
6. **Security audit** before production use

## Notes

- The pool contracts (ActivePool, DefaultPool, CollSurplusPool) are complete and working
- The interface structure is established
- The test infrastructure is in place
- The main challenge is adapting the complex business logic in BorrowerOperations and TroveManager
- Each contract requires careful review to ensure all native token operations are properly converted to ERC20
