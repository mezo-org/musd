# MUSD Protocol Scale Testing Guide

## Overview

This guide explains how to use the scale testing framework to simulate real-world usage patterns against the MUSD protocol. These scripts allow you to test protocol operations at scale with multiple wallets, transactions, and edge cases.

## Capabilities

The scale testing framework enables:

- Deploying test contracts to testnet (with TestInterestRateManager for immediate interest rate changes)
- Generating and funding test wallets
- State tracking across multiple operations
- Executing various protocol operations (opening troves, adjustments, liquidations, etc.)
- Measuring performance metrics and transaction outcomes

## Setup Process

### 1. Deploy Contracts

Deploy a new set of contracts for testing:

```bash
pnpm run deploy --network matsnet_fuzz
```

> **Note**: Using existing contracts is preferable to preserve state.

### 2. Generate Test Wallets

Create wallets for testing:

```bash
npx hardhat run scripts/scale-testing/generate-wallets.ts --network matsnet_fuzz
```

This creates wallet accounts and stores their encrypted private keys. A `password.txt` file will be generated for decryption.

> **Note**: If using existing wallets, you'll need to create the `password.txt` file yourself.

### 3. Fund Test Wallets

Distribute funds to the test wallets:

```bash
npx hardhat run scripts/scale-testing/fund-wallets.ts --network matsnet_fuzz
```

This funds wallets using the account configured in your `.env` file with `MATSNET_PRIVATE_KEY`.

### 4. Initialize State Tracking

Set up the state tracking system:

```bash
npx hardhat run scripts/scale-testing/init-state-tracking.ts --network matsnet_fuzz
```

This initializes account state tracking in `scale-testing/account-state-matsnet.json`.

### 5. Run Scenarios

Start with opening troves to create initial state:

```bash
npx hardhat run scripts/scale-testing/scenarios/open-troves.ts --network matsnet_fuzz
```

## Available Scenarios

After setup, you can run various scenarios:

### Trove Management

```bash
# Add collateral to existing troves
npx hardhat run scripts/scale-testing/scenarios/add-collateral.ts --network matsnet_fuzz

# Withdraw collateral from troves
npx hardhat run scripts/scale-testing/scenarios/withdraw-collateral.ts --network matsnet_fuzz

# Increase debt (borrow more MUSD)
npx hardhat run scripts/scale-testing/scenarios/increase-debt.ts --network matsnet_fuzz

# Close troves
npx hardhat run scripts/scale-testing/scenarios/close-trove.ts --network matsnet_fuzz
```

### MUSD Operations

```bash
# Transfer MUSD between accounts
npx hardhat run scripts/scale-testing/scenarios/send-musd.ts --network matsnet_fuzz

# Redeem MUSD for collateral
npx hardhat run scripts/scale-testing/scenarios/redeem-musd.ts --network matsnet_fuzz
```

### System Operations

```bash
# Liquidate risky troves
npx hardhat run scripts/scale-testing/scenarios/liquidate-troves.ts --network matsnet_fuzz
```

### Maintenance Scripts

These helper scripts support the testing process:

```bash
# Update the state tracking with current values
npx hardhat run scripts/scale-testing/update-trove-states.ts --network matsnet_fuzz

# Test changing the interest rate
npx hardhat run scripts/scale-testing/test-interest-rate-setting.ts --network matsnet_fuzz
```

## Results and Analysis

Test results are saved in JSON format under the `./scale-testing/results/` directory, including:

- Transaction details (hash, account, operation parameters)
- Gas usage statistics
- Success/failure rates
- Operation durations

## State Management

The `StateManager` class provides methods to:

- Track account balances, trove status, and transaction history
- Query accounts matching specific criteria
- Record actions performed during testing
- Update and maintain persistent state across test runs

This enables targeted testing of accounts with specific characteristics, such as:

```typescript
// Find accounts with MUSD balance greater than 1000
const accounts = stateManager.getAccounts({
  minMusdBalance: "1000",
  hasTrove: true,
  notUsedInTest: "redemption-test"
});
```

## Network Configuration

All commands use `--network matsnet_fuzz`, which is the network configured specifically for scale testing in the Hardhat configuration file.
