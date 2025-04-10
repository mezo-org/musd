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

Each script in the scenarios directory performs a specific action or set of actions.

They can be run like this:

npx hardhat run scripts/scale-testing/scenarios/liquidate-troves.ts --network matsnet_fuzz

matsnet_fuzz is the network used for scale-testing both for deploying contracts and running scripts.

outside of scenarios there are scripts to:
generate-wallets.ts
fund-wallets.ts
init-state-tracking.ts
update-trove-states.ts
test-interest-rate-setting.ts

The process for testing if starting from scratch:

1) Deploy a new set of contracts for testing (optional: using existing contracts is preferable to preserve state):
   $ pnpm run deploy --network matsnet_fuzz
2) Generate wallets for testing
   npx hardhat run scripts/scale-testing/generate-wallets.ts --network matsnet_fuzz
This will create wallets for testing and store their encrypted private keys.  A password.txt file will be generated for decryption.
Note if using existing wallets you will need to create the password.txt file yourself.
3) Fund wallets for testing.
npx hardhat run scripts/scale-testing/fund-wallets.ts --network matsnet_fuzz

This will fund wallets using the account configured in your .env file with MATSNET_PRIVATE_KEY.
4) Initialize state tracking
npx hardhat run scripts/scale-testing/init-state-tracking.ts --network matsnet_fuzz

This will initialize account state tracking in the file scale-testing/account-state-matsnet.json

5) Open troves as the first scenario so there are troves to adjust
npx hardhat run scripts/scale-testing/scenarios/open-troves.ts --network matsnet_fuzz

6) Run additional scenarios:
npx hardhat run scripts/scale-testing/scenarios/add-collateral.ts --network matsnet_fuzz

