# ERC20 Collateral Contracts

This directory contains contracts for using ERC20 tokens as collateral in the mUSD protocol, parallel to the native BTC collateral system.

## Completed Contracts

### Pool Contracts

- **ActivePoolERC20.sol** ✅ - Manages ERC20 collateral and debt for active troves
- **DefaultPoolERC20.sol** ✅ - Handles redistributed ERC20 collateral and debt
- **CollSurplusPoolERC20.sol** ✅ - Stores surplus ERC20 collateral from redemptions
- **SendCollateralERC20.sol** ✅ - Base contract for secure ERC20 transfers using SafeERC20

### Core Contract Skeletons

- **BorrowerOperationsERC20.sol** ⚠️ - Skeleton implementation with key patterns demonstrated

## Key Design Patterns

### 1. Transfer-Then-Track Pattern

Unlike native tokens which use `receive()` fallback, ERC20 pools require explicit transfers followed by tracking:

```solidity
// Step 1: Transfer tokens to pool
IERC20(collateralToken).safeTransferFrom(user, address(activePool), amount);

// Step 2: Track the deposit
activePool.receiveCollateral(amount);
```

### 2. No Payable Modifiers

All functions that handle collateral deposits have explicit `_collAmount` parameters:

```solidity
// Native version
function openTrove(...) external payable {
    uint256 collAmount = msg.value;
}

// ERC20 version
function openTrove(uint256 _collAmount, ...) external {
    IERC20(collateralToken).safeTransferFrom(msg.sender, address(activePool), _collAmount);
}
```

### 3. SafeERC20 for All Transfers

All ERC20 transfers use OpenZeppelin's SafeERC20 library:

```solidity
using SafeERC20 for IERC20;

IERC20(collateralToken).safeTransfer(recipient, amount);
IERC20(collateralToken).safeTransferFrom(sender, recipient, amount);
```

## Contracts Needing Full Implementation

### High Priority

1. **BorrowerOperationsERC20** - Main user interface (~1200 lines needed)

   - Internal functions: `_openTrove`, `_adjustTrove`, `_closeTrove`, `_refinance`
   - All validation and helper functions
   - Complete integration with ERC20 pools

2. **TroveManagerERC20** - Liquidations and redemptions (~1500 lines needed)

   - Liquidation logic with ERC20 transfers
   - Redemption collateral distribution
   - Pending reward management

3. **StabilityPoolERC20** - Liquidation absorption (~800 lines needed)

   - Deposit/withdrawal with ERC20
   - Liquidation offset logic
   - Collateral gain calculations

4. **PCVERC20** - Protocol fee management (~400 lines needed)
   - Fee collection and distribution
   - Bootstrap loan management
   - Collateral withdrawal

## Usage Example

```solidity
// 1. Approve BorrowerOperationsERC20 to spend your tokens
IERC20(collateralToken).approve(address(borrowerOps), collAmount);

// 2. Open a trove
borrowerOps.openTrove(
    collAmount,      // Amount of ERC20 to deposit
    debtAmount,      // Amount of mUSD to borrow
    upperHint,       // For sorted list insertion
    lowerHint        // For sorted list insertion
);

// 3. The collateral flows:
// User → ActivePoolERC20 (via transferFrom)
// ActivePool tracks the deposit
```

## Security Considerations

### ERC20-Specific Risks

- **Approval Management**: Users must approve contracts before operations
- **Reentrancy**: Guard against callback vulnerabilities even with SafeERC20
- **Decimal Handling**: Support tokens with 6-18 decimals
- **Fee-on-Transfer Tokens**: Should be rejected or handled specially

### Mitigations

- All transfers use SafeERC20
- Proper access controls on all functions
- Validation of collateral token contract
- Comprehensive testing required

## Testing

Completed:

- ✅ ActivePoolERC20 comprehensive unit tests
- ✅ MockERC20 for testing
- ✅ MockContract for dependency mocking

Needed:

- [ ] BorrowerOperationsERC20 full test suite
- [ ] Integration tests for full trove lifecycle
- [ ] Liquidation scenarios
- [ ] Recovery mode tests
- [ ] Edge cases (different token decimals, large amounts, etc.)

## Deployment

1. Deploy or select existing ERC20 token as collateral
2. Deploy pool contracts (Active, Default, CollSurplus)
3. Deploy BorrowerOperationsERC20 (when complete)
4. Deploy TroveManagerERC20 (when complete)
5. Deploy StabilityPoolERC20 (when complete)
6. Deploy PCVERC20 (when complete)
7. Call `setAddresses` on each contract
8. Verify all connections

## Development Status

**Current State**: Foundation complete with working pool contracts and test infrastructure.

**Next Steps**:

1. Complete BorrowerOperationsERC20 internal functions
2. Implement TroveManagerERC20
3. Implement StabilityPoolERC20
4. Implement PCVERC20
5. Comprehensive integration testing
6. Security audit

See `docs/ERC20-implementation-status.md` for detailed status and implementation guide.
