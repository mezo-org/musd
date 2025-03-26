# Frontend Testing Guide

## Forking the Blockchain

To test transactions on a local environment that mirrors the actual blockchain state:

1. From the `solidity` directory, start a local node with:
   ```bash
   npx hardhat node --fork https://rpc.test.mezo.org --fork-block-number BLOCK_NUMBER
   ```
   Replace `BLOCK_NUMBER` with the block number immediately before the transaction you want to test.

## Validating Transaction Hints

2. In a separate terminal, validate transaction hints:
   ```bash
   npx node scripts/validate-hints.js
   ```
   You'll need to update the script with the correct hints and NICR (Nominal ICR) parameters from the transaction you're testing.

   > **Note:** You may need to calculate the NICR manually or modify the `BorrowerOperations` contract to log it during `openTrove` calls.

## Working with Modified Contracts

For testing with modified contracts:
- Use the artifacts from `deployments/localhost`
- Be aware that these contracts won't have the same state as the contracts deployed on the blockchain
- This approach works best for testing pure functions (e.g., NICR calculations)

## Gas Estimation

To estimate gas costs for opening a trove:
```bash
npx node scripts/estimate-gas.js
```

Run this command in a separate terminal while the forked node is running.