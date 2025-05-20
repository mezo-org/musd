// scripts/scale-testing/scenarios/add-collateral.ts
import { ethers } from "hardhat"
import fs from "fs"
import path from "path"
import StateManager from "../state-manager"
import WalletHelper from "../wallet-helper"
import getContracts from "../get-contracts"
import calculateTroveOperationHints from "../hint-helper"
import {
  processBatchTransactions,
  prepareResultsForSerialization,
} from "../batch-transactions"

// Configuration
const TEST_ID = "add-collateral-test"
const NUM_ACCOUNTS = 100 // Number of accounts to use
const COLLATERAL_AMOUNTS = ["0.0001", "0.0002", "0.0003", "0.0004", "0.0005"] // BTC amounts to add
const BATCH_SIZE = 5 // Number of transactions to send in parallel

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Add Collateral test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)
  console.log(`Batch size: ${BATCH_SIZE}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  const {
    troveManagerAddress,
    borrowerOperations,
    troveManager,
    hintHelpers,
    sortedTroves,
  } = await getContracts()

  // Update trove states before selecting accounts
  // console.log("Updating Trove states for all accounts...")
  // await stateManager.updateTroveStates(troveManagerAddress)
  // console.log("Trove states updated")

  // Select accounts for testing - accounts that HAVE troves
  const testAccounts = stateManager.getAccounts({
    hasTrove: true,
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS,
  })

  console.log(
    `Selected ${testAccounts.length} accounts with existing troves for testing`,
  )

  await stateManager.updateTroveStates(
    troveManagerAddress,
    testAccounts.map((a) => a.address),
    200,
  )

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Process accounts in batches using our utility
  const results = await processBatchTransactions(
    testAccounts,
    async (account, index) => {
      const collateralAmount = ethers.parseEther(
        COLLATERAL_AMOUNTS[index % COLLATERAL_AMOUNTS.length],
      )

      console.log(
        `Processing account ${index + 1}/${testAccounts.length}: ${account.address}`,
      )
      console.log(
        `Adding ${ethers.formatEther(collateralAmount)} BTC collateral`,
      )

      // Get current trove state for reference
      let troveState
      try {
        troveState = await troveManager.Troves(account.address)
        console.log(
          `Current trove collateral: ${ethers.formatEther(troveState.coll)} BTC`,
        )
        console.log(
          `Current trove principal: ${ethers.formatEther(troveState.principal)} MUSD`,
        )
        console.log(
          `Current trove interest owed: ${ethers.formatEther(troveState.interestOwed)} MUSD`,
        )
      } catch (error) {
        console.log(`Could not fetch current trove state: ${error.message}`)
      }

      // Get the wallet
      const wallet = walletHelper.getWallet(account.address)

      if (!wallet) {
        console.log(`No wallet found for account ${account.address}, skipping`)
        return {
          success: false,
          account: account.address,
          collateralAmount: ethers.formatEther(collateralAmount),
          error: "No wallet found for account",
        }
      }

      try {
        // Record the start time
        const startTime = Date.now()

        const { upperHint, lowerHint } = await calculateTroveOperationHints({
          borrowerOperations,
          hintHelpers,
          sortedTroves,
          troveManager,
          collateralAmount,
          debtAmount: 0n,
          operation: "adjust",
          isCollIncrease: true,
          isDebtIncrease: false,
          currentCollateral: troveState?.coll,
          currentDebt:
            (troveState?.principal ?? 0n) + (troveState?.interestOwed ?? 0n),
          verbose: true,
        })

        // Add collateral transaction
        const tx = await borrowerOperations
          .connect(wallet)
          .addColl(upperHint, lowerHint, {
            value: collateralAmount,
            gasLimit: 1000000, // Explicitly set a higher gas limit
          })

        console.log(`Transaction sent: ${tx.hash}`)

        // Wait for transaction to be mined
        const receipt = await tx.wait()

        // Calculate metrics
        const endTime = Date.now()
        const duration = endTime - startTime
        const gasUsed = receipt ? receipt.gasUsed : 0n

        console.log(
          `Transaction confirmed! Gas used: ${gasUsed}, Duration: ${duration}ms`,
        )

        // Record the action in the state manager
        stateManager.recordAction(account.address, "addCollateral", TEST_ID)

        return {
          success: true,
          hash: tx.hash,
          account: account.address,
          collateralAmount: ethers.formatEther(collateralAmount),
          gasUsed,
          duration,
        }
      } catch (error) {
        console.log(`Error adding collateral: ${error.message}`)

        return {
          success: false,
          account: account.address,
          collateralAmount: ethers.formatEther(collateralAmount),
          error: error.message,
        }
      }
    },
    { testId: TEST_ID, batchSize: BATCH_SIZE },
  )

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total accounts processed: ${testAccounts.length}`)
  console.log(`Successful: ${results.successful}`)
  console.log(`Failed: ${results.failed}`)
  console.log(`Skipped: ${results.skipped}`)
  console.log(`Total gas used: ${results.gasUsed}`)
  console.log(
    `Average gas per transaction: ${results.successful > 0 ? results.gasUsed / BigInt(results.successful) : 0n}`,
  )

  // Save results to file
  const resultsDir = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "scale-testing",
    "results",
  )

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true })
  }

  const resultsFile = path.join(
    resultsDir,
    `${TEST_ID}-${new Date().toISOString().replace(/:/g, "-")}.json`,
  )
  fs.writeFileSync(
    resultsFile,
    JSON.stringify(
      {
        testId: TEST_ID,
        timestamp: new Date().toISOString(),
        network: networkName,
        config: {
          numAccounts: NUM_ACCOUNTS,
          collateralAmounts: COLLATERAL_AMOUNTS,
          batchSize: BATCH_SIZE,
        },
        results: prepareResultsForSerialization(results),
      },
      null,
      2,
    ),
  )

  console.log(`Results saved to ${resultsFile}`)

  // Update all Trove states again to ensure data is current
  console.log("\nUpdating Trove states for all accounts...")
  await stateManager.updateTroveStates(
    troveManagerAddress,
    testAccounts.map((a) => a.address),
    200,
  )

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
