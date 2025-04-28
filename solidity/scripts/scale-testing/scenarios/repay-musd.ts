// scripts/scale-testing/scenarios/repay-musd.ts
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
const TEST_ID = "repay-musd-test"
const NUM_ACCOUNTS = 200 // Number of accounts to use
const REPAYMENT_PERCENTAGES = [10, 20, 30, 40, 50] // Percentage of debt to repay
const BATCH_SIZE = 5 // Number of transactions to send in parallel

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Repay MUSD test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)
  console.log(`Batch size: ${BATCH_SIZE}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  const {
    troveManagerAddress,
    musdAddress,
    borrowerOperations,
    troveManager,
    hintHelpers,
    sortedTroves,
    musdToken,
  } = await getContracts()

  // Update trove states before selecting accounts
  console.log("Updating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)
  console.log("Trove states updated")

  // Update MUSD balances
  console.log("Updating MUSD balances for all accounts...")
  await stateManager.updateMusdBalances(musdAddress)
  console.log("MUSD balances updated")

  // Select accounts for testing - accounts that HAVE troves AND MUSD
  const testAccounts = stateManager.getAccounts({
    hasTrove: true,
    minMusdBalance: "50", // Minimum MUSD balance to be able to repay
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS,
  })

  console.log(
    `Selected ${testAccounts.length} accounts with troves and MUSD for testing`,
  )

  if (testAccounts.length === 0) {
    console.error(
      "No suitable accounts found. Make sure accounts have both troves and MUSD.",
    )
    process.exit(1)
  }

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Process accounts in batches
  const results = await processBatchTransactions(
    testAccounts,
    async (account, index) => {
      const repaymentPercentage =
        REPAYMENT_PERCENTAGES[index % REPAYMENT_PERCENTAGES.length]

      console.log(
        `Processing account ${index + 1}/${testAccounts.length}: ${account.address}`,
      )

      // Get current trove state for reference
      let troveDebt = BigInt(0)
      let troveState
      try {
        troveState = await troveManager.Troves(account.address)
        const totalDebt = troveState.principal + troveState.interestOwed
        troveDebt = totalDebt

        console.log(
          `Current trove collateral: ${ethers.formatEther(troveState.coll)} BTC`,
        )
        console.log(
          `Current trove principal: ${ethers.formatEther(troveState.principal)} MUSD`,
        )
        console.log(
          `Current trove interest owed: ${ethers.formatEther(troveState.interestOwed)} MUSD`,
        )
        console.log(
          `Current trove total debt: ${ethers.formatEther(totalDebt)} MUSD`,
        )
      } catch (error) {
        console.log(`Could not fetch current trove state: ${error.message}`)
        return {
          success: false,
          account: account.address,
          repaymentPercentage,
          error: `Could not fetch trove state: ${error.message}`,
        }
      }

      // Get current MUSD balance
      let musdBalance = BigInt(0)
      try {
        musdBalance = await musdToken.balanceOf(account.address)
        console.log(
          `Current MUSD balance: ${ethers.formatEther(musdBalance)} MUSD`,
        )
      } catch (error) {
        console.log(`Could not fetch MUSD balance: ${error.message}`)
        return {
          success: false,
          account: account.address,
          repaymentPercentage,
          error: `Could not fetch MUSD balance: ${error.message}`,
        }
      }

      // Calculate repayment amount (percentage of debt)
      let repayAmount = (troveDebt * BigInt(repaymentPercentage)) / BigInt(100)
      console.log(
        `Target repayment amount (${repaymentPercentage}% of debt): ${ethers.formatEther(repayAmount)} MUSD`,
      )

      // Check if account has enough MUSD to repay
      if (musdBalance < repayAmount) {
        console.log(
          `Account doesn't have enough MUSD to repay ${repaymentPercentage}% of debt`,
        )
        console.log(
          `Adjusting repayment to available balance: ${ethers.formatEther(musdBalance)} MUSD`,
        )
        repayAmount = musdBalance
      }

      // Ensure repayment doesn't leave less than minimum debt (2000 MUSD)
      const minDebt = ethers.parseEther("2000")
      const remainingDebt = troveDebt - repayAmount

      if (remainingDebt < minDebt && remainingDebt > 0) {
        console.log(
          "Repayment would leave less than minimum debt. Adjusting...",
        )
        // Either repay fully or leave at least minimum debt
        if (troveDebt - minDebt > 0) {
          repayAmount = troveDebt - minDebt
          console.log(
            `Adjusted repayment to: ${ethers.formatEther(repayAmount)} MUSD (leaving minimum debt)`,
          )
        } else {
          console.log(
            "Cannot adjust repayment to maintain minimum debt. Skipping.",
          )
          return {
            success: false,
            account: account.address,
            repaymentPercentage,
            error: "Cannot maintain minimum debt requirement",
          }
        }
      }

      // Skip if repayment amount is too small
      if (repayAmount <= 0) {
        console.log("Repayment amount is zero or negative. Skipping.")
        return {
          success: false,
          account: account.address,
          repaymentPercentage,
          error: "Repayment amount is zero or negative",
        }
      }

      console.log(
        `Final repayment amount: ${ethers.formatEther(repayAmount)} MUSD`,
      )

      // Get the wallet
      const wallet = walletHelper.getWallet(account.address)

      if (!wallet) {
        console.log(`No wallet found for account ${account.address}, skipping`)
        return {
          success: false,
          account: account.address,
          repaymentPercentage,
          repayAmount: ethers.formatEther(repayAmount),
          error: "No wallet found for account",
        }
      }

      try {
        const { upperHint, lowerHint } = await calculateTroveOperationHints({
          borrowerOperations,
          hintHelpers,
          sortedTroves,
          troveManager,
          collateralAmount: 0n,
          debtAmount: repayAmount,
          operation: "adjust",
          isCollIncrease: false,
          isDebtIncrease: false,
          currentCollateral: troveState?.coll,
          currentDebt:
            (troveState?.principal ?? 0n) + (troveState?.interestOwed ?? 0n),
          verbose: true,
        })
        // Record the start time
        const startTime = Date.now()

        // Repay MUSD
        console.log("Repaying MUSD...")
        const tx = await borrowerOperations
          .connect(wallet)
          .repayMUSD(repayAmount, upperHint, lowerHint, {
            gasLimit: 1000000, // Higher gas limit for complex operation
          })

        console.log(`Transaction sent: ${tx.hash}`)

        // Wait for transaction to be mined
        const receipt = await tx.wait()

        // Calculate metrics
        const endTime = Date.now()
        const duration = endTime - startTime
        const gasUsed = receipt ? receipt.gasUsed : BigInt(0)

        console.log(
          `Transaction confirmed! Gas used: ${gasUsed}, Duration: ${duration}ms`,
        )

        // Record the action in the state manager
        stateManager.recordAction(account.address, "repayMusd", TEST_ID)

        return {
          success: true,
          hash: tx.hash,
          account: account.address,
          repaymentPercentage,
          repayAmount: ethers.formatEther(repayAmount),
          gasUsed,
          duration,
        }
      } catch (error) {
        console.log(`Error repaying MUSD: ${error.message}`)
        return {
          success: false,
          account: account.address,
          repaymentPercentage,
          repayAmount: ethers.formatEther(repayAmount),
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
          repaymentPercentages: REPAYMENT_PERCENTAGES,
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
  await stateManager.updateTroveStates(troveManagerAddress)

  // Update MUSD balances
  console.log("Updating MUSD balances for all accounts...")
  await stateManager.updateMusdBalances(musdAddress)

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
