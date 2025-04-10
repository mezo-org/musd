# Purpose

Set of scripts for running trove operations on testnet.  The scripts include:
- Deploy set of test contracts to testnet (notably with TestInterestRateManager that allows for changing interest rate without a delay)
- Generate test wallets
- Fund test wallets
- Initialize state tracking
- Run test scenarios (opening troves, adjusting trove positions, liquidations, and redemptions)

Results are saved in JSON format under ./data/results/ directory, including:
- Transaction details
- Gas usage statistics
- Success/failure rates