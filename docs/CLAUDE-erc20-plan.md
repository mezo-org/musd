# Plan: ERC20 Collateral Management for mUSD Protocol

## Overview
Create a parallel set of contracts that use ERC20 tokens instead of native tokens for collateral management, maintaining compatibility with the existing MUSD system while providing a clean separation of concerns.

## Architecture Approach
- **Separate Package Structure**: Create a new `solidity/contracts/erc20/` directory for ERC20 collateral contracts
- **Parallel Contracts**: Maintain both native and ERC20 versions side-by-side
- **Existing Token Integration**: Support any existing ERC20 token as collateral

## Phase 1: Contract Implementation

### 1.1 Create Core ERC20 Collateral Contracts
**New contracts in `solidity/contracts/erc20/`:**

- **CollateralToken.sol**: Interface for ERC20 collateral token management
- **SendCollateralERC20.sol**: Replace `SendCollateral.sol` to handle ERC20 transfers
- **ActivePoolERC20.sol**: Modified ActivePool for ERC20 collateral custody
- **BorrowerOperationsERC20.sol**: Handle trove operations with ERC20 collateral
- **DefaultPoolERC20.sol**: Track redistributed ERC20 collateral
- **CollSurplusPoolERC20.sol**: Hold surplus ERC20 collateral
- **StabilityPoolERC20.sol**: Handle liquidations with ERC20 collateral
- **TroveManagerERC20.sol**: Manage troves with ERC20 collateral
- **PCVERC20.sol**: Protocol controlled value for ERC20 collateral

### 1.2 Key Implementation Changes

**BorrowerOperationsERC20:**
- Remove `payable` modifiers from functions
- Add `collateralToken` parameter to functions
- Replace `msg.value` with `amount` parameter
- Add `IERC20(collateralToken).transferFrom()` for collateral deposits
- Update collateral calculations to use ERC20 amounts

**ActivePoolERC20:**
- Remove `receive()` function
- Add `collateralToken` state variable
- Replace native token transfers with ERC20 transfers
- Add `receiveCollateral(uint256 amount)` function for deposits

**SendCollateralERC20:**
- Replace `call{value:}` with `IERC20.transfer()`
- Add safe transfer checks
- Handle ERC20-specific edge cases

**StabilityPoolERC20:**
- Update liquidation logic for ERC20 collateral
- Modify reward distribution for ERC20 tokens

## Phase 2: Interface Updates

### 2.1 Create New Interfaces
**New interfaces in `solidity/contracts/interfaces/erc20/`:**
- `IActivePoolERC20.sol`
- `IBorrowerOperationsERC20.sol`
- `IStabilityPoolERC20.sol`
- `ITroveManagerERC20.sol`
- `IPoolERC20.sol`

### 2.2 Interface Changes
- Add `collateralToken` parameters where needed
- Remove `payable` from function signatures
- Add ERC20-specific events

## Phase 3: Testing Infrastructure

### 3.1 Test Structure
**New test directory: `solidity/test/erc20/`**

Test categories:
- Unit tests for each ERC20 contract
- Integration tests for ERC20 collateral flow
- Recovery mode tests with ERC20 collateral
- Liquidation and redemption tests

### 3.2 Test Helpers
**New helpers in `solidity/test/helpers/erc20/`:**
- `openTroveERC20()`: Open trove with ERC20 collateral
- `addCollERC20()`: Add ERC20 collateral to trove
- `setupERC20Tests()`: Initialize test environment with ERC20
- Mock ERC20 token for testing

### 3.3 Test Coverage Goals
- 100% function coverage for critical paths
- Edge cases for ERC20-specific scenarios:
  - Token approval failures
  - Transfer failures
  - Reentrancy protection
  - Decimal precision handling

## Phase 4: Deployment Scripts

### 4.1 Deployment Structure
**New scripts in `solidity/deploy/erc20/`:**
- `100_deploy_erc20_active_pool.ts`
- `101_deploy_erc20_borrower_operations.ts`
- `102_deploy_erc20_trove_manager.ts`
- `103_deploy_erc20_stability_pool.ts`
- `104_deploy_erc20_default_pool.ts`
- `105_deploy_erc20_coll_surplus_pool.ts`
- `106_deploy_erc20_pcv.ts`
- `110_set_erc20_addresses.ts`

## Phase 5: Integration & Security

### 5.1 Security Considerations
- **Approval Management**: Implement proper approval patterns
- **Reentrancy Guards**: Add checks for all external calls
- **Token Validation**: Verify token contract is valid ERC20
- **Decimal Handling**: Support tokens with different decimals
- **Fee-on-transfer Tokens**: Handle or explicitly reject

### 5.2 Integration Points
- Maintain compatibility with existing MUSD token
- Share common contracts (SortedTroves, HintHelpers, PriceFeed)
- Allow same governance/admin structure
- Support migration path from native to ERC20

## Phase 6: Documentation & Migration

### 6.1 Documentation
- Technical specification for ERC20 collateral
- API documentation for new functions
- Migration guide for users
- Integration guide for developers

### 6.2 Migration Support
- Scripts to help users migrate positions
- Tools to compare native vs ERC20 implementations
- Monitoring dashboards for both systems

## Implementation Order

### Week 1-2: Core Contracts
- Implement SendCollateralERC20 and ActivePoolERC20
- Create BorrowerOperationsERC20 with basic functions
- Set up initial test infrastructure

### Week 3-4: Liquidation & Redemption
- Implement TroveManagerERC20
- Create StabilityPoolERC20
- Add DefaultPool and CollSurplusPool ERC20 versions

### Week 5-6: Testing & Integration
- Complete unit tests for all contracts
- Integration testing with mock ERC20 tokens
- Security review and gas optimization

### Week 7-8: Deployment & Documentation
- Create deployment scripts
- Write comprehensive documentation
- Prepare migration tools

## Benefits of This Approach

1. **Clean Separation**: ERC20 contracts isolated from native token logic
2. **Maintainability**: Easy to update either implementation independently
3. **Flexibility**: Support multiple ERC20 tokens as collateral
4. **Testing**: Comprehensive test coverage with clear separation
5. **Migration Path**: Users can choose which system to use
6. **Security**: Isolated risk - issues in one don't affect the other

## Next Steps After Plan Approval

1. Create directory structure for ERC20 contracts
2. Implement SendCollateralERC20 as foundation
3. Create ActivePoolERC20 with ERC20 support
4. Set up initial test framework with mock ERC20
5. Implement BorrowerOperationsERC20 core functions
6. Add comprehensive unit tests for each component

## Key Technical Decisions

### Collateral Token Management
- Single collateral token per deployment (not multi-collateral)
- Token address set at deployment time
- Immutable after initialization for security

### Approval Pattern
- Users approve BorrowerOperationsERC20 contract
- BorrowerOperationsERC20 transfers on behalf of users
- No infinite approvals required

### Decimal Precision
- Support tokens with 6-18 decimals
- Internal calculations normalized to 18 decimals
- Conversion helpers for different decimal tokens

### Gas Optimization
- Batch operations where possible
- Storage optimization for token balances
- Efficient approval and transfer patterns

## Risk Mitigation

### Smart Contract Risks
- Comprehensive unit and integration testing
- Formal verification for critical paths
- Multiple security audits before mainnet
- Bug bounty program

### Operational Risks
- Gradual rollout with limits
- Emergency pause functionality
- Clear migration procedures
- Monitoring and alerting

### Token-Specific Risks
- Whitelist approved collateral tokens
- Reject fee-on-transfer tokens
- Handle token upgrades carefully
- Monitor token contract changes

## Success Criteria

1. **Functional**: All core operations work with ERC20 collateral
2. **Secure**: Pass security audits with no critical issues
3. **Efficient**: Gas costs comparable to native implementation
4. **Tested**: >95% test coverage with edge cases
5. **Documented**: Complete technical and user documentation
6. **Compatible**: Works alongside existing native token system