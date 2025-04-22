// scripts/scale-testing/scenarios/withdraw-collateral.ts
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
const TEST_ID = "withdraw-collateral-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use
const WITHDRAWAL_PERCENTAGES = [5, 10, 15, 20, 25] // Percentage of collateral to withdraw
const BATCH_SIZE = 5 // Number of transactions to send in parallel

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Withdraw Collateral test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)
  console.log(`Batch size: ${BATCH_SIZE}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  const {
    troveManagerAddress,
    borrowerOperations,
    priceFeed,
    troveManager,
    hintHelpers,
    sortedTroves,
  } = await getContracts()

  // Get the current BTC price from the price feed
  let currentPrice
  try {
    currentPrice = await priceFeed.fetchPrice()
    console.log(`Current BTC price: $${ethers.formatEther(currentPrice)}`)
  } catch (error) {
    console.error(`Error getting price: ${error.message}`)
    process.exit(1)
  }

  // Update trove states before selecting accounts
  console.log("Updating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)
  console.log("Trove states updated")

  // Select accounts for testing - accounts that HAVE troves
  const testAccounts = stateManager.getAccounts({
    hasTrove: true,
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS,
  })

  console.log(
    `Selected ${testAccounts.length} accounts with troves for testing`,
  )

  if (testAccounts.length === 0) {
    console.error("No accounts with troves found.")
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
      const withdrawalPercentage =
        WITHDRAWAL_PERCENTAGES[index % WITHDRAWAL_PERCENTAGES.length]

      console.log(
        `Processing account ${index + 1}/${testAccounts.length}: ${account.address}`,
      )

      // Get current trove state for reference
      let troveCollateral = BigInt(0)
      let troveDebt = BigInt(0)
      try {
        const troveState = await troveManager.Troves(account.address)
        troveCollateral = troveState.coll
        const totalDebt = troveState.principal + troveState.interestOwed
        troveDebt = totalDebt

        console.log(
          `Current trove collateral: ${ethers.formatEther(troveCollateral)} BTC`,
        )
        console.log(
          `Current trove total debt: ${ethers.formatEther(troveDebt)} MUSD`,
        )
      } catch (error) {
        console.log(`Could not fetch current trove state: ${error.message}`)
        return {
          success: false,
          account: account.address,
          withdrawalPercentage,
          error: `Could not fetch trove state: ${error.message}`,
        }
      }

      // Calculate withdrawal amount (percentage of collateral)
      let withdrawAmount =
        (troveCollateral * BigInt(withdrawalPercentage)) / BigInt(100)
      console.log(
        `Target withdrawal amount (${withdrawalPercentage}% of collateral): ${ethers.formatEther(withdrawAmount)} BTC`,
      )

      // Calculate current ICR (Individual Collateral Ratio)
      const currentICR = (troveCollateral * currentPrice) / troveDebt
      console.log(
        `Current ICR: ${ethers.formatEther(currentICR * BigInt(100))}%`,
      )

      // Calculate new ICR after withdrawal
      const newCollateral = troveCollateral - withdrawAmount
      const newICR = (newCollateral * currentPrice) / troveDebt
      console.log(
        `Projected ICR after withdrawal: ${ethers.formatEther(newICR * BigInt(100))}%`,
      )

      // Ensure ICR stays above minimum (110%)
      const minICR = ethers.parseEther("1.1") // 110%
      if (newICR < minICR) {
        console.log("Withdrawal would put ICR below minimum. Adjusting...")

        // Calculate maximum withdrawal that keeps ICR above minimum
        // Formula: maxWithdrawal = collateral - (minICR * debt / price)
        const minCollateral = (minICR * troveDebt) / currentPrice
        const maxWithdrawal = troveCollateral - minCollateral

        if (maxWithdrawal <= 0) {
          console.log(
            "Cannot withdraw any collateral while maintaining minimum ICR. Skipping.",
          )
          return {
            success: false,
            account: account.address,
            withdrawalPercentage,
            error: "Cannot maintain minimum ICR",
          }
        }

        // Apply a safety buffer (95% of max)
        withdrawAmount = (maxWithdrawal * 95n) / 100n
        console.log(
          `Adjusted withdrawal to: ${ethers.formatEther(withdrawAmount)} BTC (to maintain minimum ICR)`,
        )

        // Recalculate projected ICR
        const adjustedNewCollateral = troveCollateral - withdrawAmount
        const adjustedNewICR =
          (adjustedNewCollateral * currentPrice) / troveDebt
        console.log(
          `Adjusted projected ICR: ${ethers.formatEther(adjustedNewICR * BigInt(100))}%`,
        )
      }

      // Skip if withdrawal amount is too small
      if (withdrawAmount <= 0) {
        console.log("Withdrawal amount is zero or negative. Skipping.")
        return {
          success: false,
          account: account.address,
          withdrawalPercentage,
          error: "Withdrawal amount is zero or negative",
        }
      }

      console.log(
        `Final withdrawal amount: ${ethers.formatEther(withdrawAmount)} BTC`,
      )

      // Get the wallet
      const wallet = walletHelper.getWallet(account.address)

      if (!wallet) {
        console.log(`No wallet found for account ${account.address}, skipping`)
        return {
          success: false,
          account: account.address,
          withdrawalPercentage,
          withdrawAmount: ethers.formatEther(withdrawAmount),
          error: "No wallet found for account",
        }
      }

      try {
        const { upperHint, lowerHint } = await calculateTroveOperationHints({
          hintHelpers,
          sortedTroves,
          troveManager,
          collateralAmount: withdrawAmount,
          debtAmount: 0n,
          operation: "adjust",
          isCollIncrease: false,
          isDebtIncrease: false,
          currentCollateral: troveCollateral,
          currentDebt: troveDebt,
          verbose: true,
        })

        // Record the start time
        const startTime = Date.now()

        // Withdraw collateral
        console.log("Withdrawing collateral...")
        const tx = await borrowerOperations
          .connect(wallet)
          .withdrawColl(withdrawAmount, upperHint, lowerHint, {
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
        stateManager.recordAction(
          account.address,
          "withdrawCollateral",
          TEST_ID,
        )

        return {
          success: true,
          hash: tx.hash,
          account: account.address,
          withdrawalPercentage,
          withdrawAmount: ethers.formatEther(withdrawAmount),
          gasUsed,
          duration,
        }
      } catch (error) {
        console.log(`Error withdrawing collateral: ${error.message}`)
        return {
          success: false,
          account: account.address,
          withdrawalPercentage,
          withdrawAmount: ethers.formatEther(withdrawAmount),
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
          withdrawalPercentages: WITHDRAWAL_PERCENTAGES,
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

  // Update BTC balances
  console.log("Updating BTC balances for all accounts...")
  await stateManager.updateBtcBalances()

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
