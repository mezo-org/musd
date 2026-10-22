# CLAUDE.md - Agent Instructions

## Project Context

mUSD is a decentralized stablecoin protocol built for the Mezo network. It allows Bitcoin holders to mint mUSD stablecoins by creating Collateralized Debt Positions (CDPs) using their BTC as collateral. The protocol maintains a $1 USD peg through arbitrage mechanisms, liquidations, and redemptions.

The system is based on Threshold USD (a Liquity fork) with key enhancements including:
- Fixed-rate borrowing with refinancing capabilities
- Protocol Controlled Value (PCV) for fee management
- EIP-712 signature verification for delegation
- Upgradeable contracts for flexibility

## Commands

**Primary development happens in the `solidity/` directory.**

- Build: `cd solidity && pnpm build` 
- Test: `cd solidity && pnpm test`
- Deploy: `cd solidity && pnpm deploy --network matsnet`
- Coverage: `cd solidity && pnpm coverage`
- Lint: `cd solidity && pnpm format` (fix: `pnpm format:fix`)
- Clean: `cd solidity && pnpm clean`

**Root level:**
- Format: `pnpm format` (fix: `pnpm format:fix`)

**dApp (minimal/not primary focus):**
- Dev: `cd dapp && pnpm dev`
- Build: `cd dapp && pnpm build`  
- Test: `cd dapp && pnpm test`

## Code Layout

The project is a pnpm monorepo with two main packages:
- `solidity/` - Core smart contracts (primary focus)
- `dapp/` - React frontend (minimal/placeholder)

### Key Contract Architecture

**Core Protocol:**
- `BorrowerOperations.sol` - Main user interface for trove management
- `TroveManager.sol` - Handles liquidations, redemptions, and trove state
- `StabilityPool.sol` - Stability pool for liquidation absorption
- `MUSD.sol` - The stablecoin token with governance controls

**Supporting Contracts:**
- `InterestRateManager.sol` - Interest rate calculations and management
- `PCV.sol` - Protocol Controlled Value for fee distribution
- `PriceFeed.sol` - Oracle integration for price data
- `SortedTroves.sol` - Efficient trove ordering by collateral ratio

**Asset Pools:**
- `ActivePool.sol` - Holds collateral and debt for active troves
- `DefaultPool.sol` - Handles redistributed debt/collateral
- `CollSurplusPool.sol` - Stores surplus collateral from liquidations
- `GasPool.sol` - Gas compensation mechanism

## Code Style

- **License:** GPL-3.0 for all contracts
- **Solidity Version:** 0.8.24 (consistent across all contracts)
- **Style Guide:** Thesis standards via `@thesis-co/eslint-config` and prettier
- **Formatting:** Uses prettier with `prettier-plugin-solidity`

### Solidity Conventions
- Use explicit Solidity version pragma: `pragma solidity 0.8.24;`
- Import OpenZeppelin contracts for standard functionality
- Use OpenZeppelin's upgradeable contracts pattern with initializers
- Follow existing interface patterns in `interfaces/` directory
- Use custom errors for gas optimization
- Implement proper access controls (ownership, role-based)

### TypeScript/JavaScript (for tests/scripts)
- Use TypeScript with strict typing
- Follow `@thesis-co/eslint-config` standards
- Use `ethers.js` v6 for blockchain interactions
- Hardhat for testing and deployment framework
- Use descriptive test names and group related tests in `describe` blocks

### Testing Patterns
- Comprehensive unit tests for all core functionality
- Use Hardhat's built-in testing framework with Chai matchers
- Test both normal mode and recovery mode scenarios
- Include liquidation and redemption edge cases
- Test signature verification thoroughly for delegation features
- Mock price feeds and time-dependent functionality appropriately

## File Structure Focus

**Primary focus areas:**
- `solidity/contracts/` - Core smart contracts
- `solidity/test/` - Test suites  
- `solidity/deploy/` - Deployment scripts
- `solidity/helpers/` - Utility functions

**Avoid modifying:**
- `solidity/node_modules/`, `solidity/cache/`, `solidity/build/`
- `solidity/coverage/`, `solidity/artifacts/`
- `solidity/scale-testing/` - Complex scale testing infrastructure
- `solidity/echidna-corpus/`, `solidity/crytic-export/` - Fuzzing artifacts
- `solidity/temp/` - Temporary files
- `dapp/node_modules/`

## Domain-Specific Guidelines

### DeFi/Stablecoin Development
- **Security First:** All operations must maintain system solvency and prevent undercollateralization
- **Precision:** Use appropriate decimal precision for financial calculations
- **Oracle Dependency:** Consider price feed reliability and potential manipulation
- **Liquidation Logic:** Ensure liquidations are profitable to maintain system health
- **Interest Calculations:** Simple interest model, not compound
- **Gas Optimization:** Include gas compensation mechanisms for liquidators

### Key Protocol Concepts
- **Troves:** Individual collateralized debt positions 
- **ICR (Individual Collateral Ratio):** Per-trove collateralization percentage
- **TCR (Total Collateral Ratio):** System-wide collateralization
- **Recovery Mode:** Activated when TCR < 150% (Critical Collateral Ratio)
- **Redemptions:** Direct mUSD-to-BTC swaps that maintain price floor
- **Liquidations:** Force-closing undercollateralized positions
- **Bootstrap Loan:** Initial StabilityPool seeding mechanism

### Upgrade Patterns
- Use OpenZeppelin's upgradeable contracts with proper initialization
- Implement governance delays for sensitive operations
- Ensure upgrade compatibility doesn't break existing trove states
- Plan migration strategies for major version changes

## Git Conventions

- Create logical, cohesive commits for each implementation step
- Use descriptive commit messages explaining the "why" not just the "what"
- Run linting (`pnpm format`), compilation (`pnpm build`), and unit tests (`pnpm test`) before committing
- Scale testing, invariant tests, and coverage reports are not required for every commit
- Don't mix convention changes with functional changes

## Integration Notes

- Protocol integrates with Mezo ecosystem for fee distribution
- EIP-712 signatures enable delegation and smart contract integration
- Designed for Bitcoin-based collateral on Mezo network