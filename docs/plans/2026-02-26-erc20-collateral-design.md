# ERC20 Collateral Support Design

**Date:** 2026-02-26
**Status:** Approved
**Author:** Claude (Superpowers)

## Overview

This design adds ERC20 token collateral support to the mUSD protocol through a parallel set of contracts. Users can open troves using ERC20 tokens (e.g., WBTC, stETH) instead of native BTC, while maintaining the same protocol mechanics.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Parallel contract set | Clean isolation, independent auditing, no risk to native contracts |
| Collateral per deployment | Single token | Simpler, matches existing pattern, deploy new set per token |
| Decimal support | 18 decimals only | Matches protocol internals, avoids conversion complexity |
| Fee-on-transfer tokens | Not supported | Explicitly rejected for simplicity and safety |

## Architecture

### Contracts Requiring ERC20 Versions

| Native Contract | ERC20 Version | Purpose |
|----------------|---------------|---------|
| `SendCollateral.sol` | `SendCollateralERC20.sol` | Base transfer pattern |
| `ActivePool.sol` | `ActivePoolERC20.sol` | Primary collateral custody |
| `DefaultPool.sol` | `DefaultPoolERC20.sol` | Redistribution collateral |
| `CollSurplusPool.sol` | `CollSurplusPoolERC20.sol` | Surplus collateral claims |
| `StabilityPool.sol` | `StabilityPoolERC20.sol` | Liquidation collateral distribution |
| `BorrowerOperations.sol` | `BorrowerOperationsERC20.sol` | User entry point |
| `TroveManager.sol` | `TroveManagerERC20.sol` | Liquidation/redemption orchestration |
| `PCV.sol` | `PCVERC20.sol` | Fee collateral management |

### Shared Contracts (Unchanged)

- `MUSD.sol` - Debt token (no collateral handling)
- `SortedTroves.sol` - Data structure (no collateral)
- `HintHelpers.sol` - Read-only calculations
- `PriceFeed.sol` - Price oracle (token agnostic)
- `GasPool.sol` - MUSD only
- `InterestRateManager.sol` - Interest calculations
- `GovernableVariables.sol` - Configuration

### File Structure

```
solidity/contracts/
├── dependencies/
│   └── SendCollateralERC20.sol
├── erc20/
│   ├── ActivePoolERC20.sol
│   ├── BorrowerOperationsERC20.sol
│   ├── CollSurplusPoolERC20.sol
│   ├── DefaultPoolERC20.sol
│   ├── PCVERC20.sol
│   ├── StabilityPoolERC20.sol
│   └── TroveManagerERC20.sol
├── interfaces/erc20/
│   ├── IActivePoolERC20.sol
│   ├── IBorrowerOperationsERC20.sol
│   ├── ICollSurplusPoolERC20.sol
│   ├── IDefaultPoolERC20.sol
│   ├── IPCVERC20.sol
│   ├── IPoolERC20.sol
│   ├── IStabilityPoolERC20.sol
│   └── ITroveManagerERC20.sol
└── test/
    └── MockERC20.sol

solidity/test/erc20/
├── ActivePoolERC20.test.ts
├── BorrowerOperationsERC20.test.ts
├── CollSurplusPoolERC20.test.ts
├── DefaultPoolERC20.test.ts
├── StabilityPoolERC20.test.ts
├── TroveManagerERC20.test.ts
├── PCVERC20.test.ts
└── Integration.test.ts
```

## Core Transfer Pattern

### Native Pattern (Current)

```solidity
function _sendCollateral(address _recipient, uint256 _amount) internal {
    (bool success, ) = _recipient.call{value: _amount}("");
    require(success, "Sending BTC failed");
}
```

### ERC20 Pattern (New)

```solidity
abstract contract SendCollateralERC20 {
    IERC20 public immutable collateralToken;

    function _sendCollateral(address _recipient, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transfer(_recipient, _amount);
        if (!success) revert CollateralTransferFailed();
    }

    function _pullCollateral(address _from, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transferFrom(_from, address(this), _amount);
        if (!success) revert CollateralTransferFailed();
    }
}
```

### Pool Receive Pattern Change

| Native | ERC20 |
|--------|-------|
| `receive() external payable` | `receiveCollateral(uint256 _amount) external` |
| Implicit value via `msg.value` | Explicit amount parameter |
| Caller sends value | Caller approves, pool pulls |

## User Flow Changes

### Opening a Trove

**Native:**
```
User calls openTrove{value: collateral}(debtAmount, hints)
```

**ERC20:**
```
1. User calls collateralToken.approve(borrowerOps, collateral)
2. User calls openTrove(collateral, debtAmount, hints)
```

### Function Signature Changes

| Native | ERC20 |
|--------|-------|
| `openTrove(uint _debtAmount, ...) payable` | `openTrove(uint _collAmount, uint _debtAmount, ...)` |
| `addColl(...) payable` | `addColl(uint _collAmount, ...)` |
| `adjustTrove(...) payable` | `adjustTrove(uint _collDeposit, ...)` |

## Pool-to-Pool Transfer Flow

When Pool A needs to send collateral to Pool B:

1. Pool A approves Pool B for the amount
2. Pool A calls `poolB.receiveCollateral(amount)`
3. Pool B pulls via `transferFrom`

This maintains the same access control pattern while adapting to ERC20 mechanics.

## Security Considerations

### Reentrancy Protection

All user-facing functions use OpenZeppelin's `ReentrancyGuardUpgradeable`:

- `BorrowerOperationsERC20`: `openTrove`, `adjustTrove`, `closeTrove`, `addColl`, `withdrawColl`
- `StabilityPoolERC20`: `provideToSP`, `withdrawFromSP`, `withdrawCollateralGainToTrove`
- `CollSurplusPoolERC20`: `claimColl`

### Token Validation at Deployment

```solidity
function initialize(address _collateralToken, ...) external initializer {
    require(_collateralToken != address(0), "Invalid collateral token");
    require(_collateralToken.code.length > 0, "Not a contract");
    IERC20(_collateralToken).totalSupply();  // Verify ERC20 interface
    collateralToken = IERC20(_collateralToken);
}
```

### Security Assumptions

- Collateral token is standard ERC20 (18 decimals)
- Collateral token is NOT fee-on-transfer
- Collateral token is NOT rebasing
- Collateral token transfer hooks (if any) are benign (mitigated by ReentrancyGuard)

### Invariants

1. `activePool.collateral == collateralToken.balanceOf(activePool)`
2. `defaultPool.collateral == collateralToken.balanceOf(defaultPool)`
3. `stabilityPool.collateral == collateralToken.balanceOf(stabilityPool)`
4. Sum of all pool collateral == total collateral in system

## Error Handling

Custom errors for gas efficiency:

```solidity
error CollateralTransferFailed();
error CollateralApprovalFailed();
error InsufficientCollateralBalance();
error UnauthorizedCaller(address caller, string expectedRole);
error ZeroCollateralAmount();
```

## Testing Strategy

### Test Categories

| Category | Examples |
|----------|----------|
| Expected Reverts | Unauthorized caller, insufficient approval, insufficient balance |
| Emitted Events | CollateralBalanceUpdated, TroveUpdated |
| State Changes | Collateral balances, trove state |
| Balance Changes | User token balances, pool balances |
| Access Control | Only authorized contracts can call |

### ERC20-Specific Test Cases

1. Approval failures - User hasn't approved, insufficient allowance
2. Transfer failures - Insufficient balance
3. Reentrancy protection - Malicious token callback attempts
4. Zero amount handling - Graceful handling of zero transfers
5. Multiple operations - Approve once, use across multiple calls

### Integration Tests

- Full trove lifecycle (open → adjust → close)
- Liquidation with StabilityPool offset
- Liquidation with redistribution
- Redemption flow
- StabilityPool deposit/withdraw with collateral gains

## Out of Scope

- Multi-collateral support in single contract set
- Decimal conversion (non-18 decimal tokens)
- Fee-on-transfer token support
- Rebasing token support
- Deployment scripts (separate task)
- Migration tooling (separate task)
