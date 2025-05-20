// scripts/scale-testing/scenarios/increase-debt.ts
import { ethers } from "hardhat"
import fs from "fs"
import path from "path"
import StateManager from "../state-manager"
import WalletHelper from "../wallet-helper"
import getDeploymentAddress from "../../deployment-helpers"
import getContracts from "../get-contracts"
import calculateTroveOperationHints from "../hint-helper"
import {
  processBatchTransactions,
  prepareResultsForSerialization,
} from "../batch-transactions"

// Configuration
const TEST_ID = "increase-debt-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use
const MUSD_AMOUNTS = ["100", "200", "300", "400", "500"] // MUSD amounts to borrow
const BATCH_SIZE = 5 // Number of transactions to send in parallel

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Increase Debt test on network: ${networkName}`)
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

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Update trove states for selected accounts
  await stateManager.updateTroveStates(troveManagerAddress, addresses, 200)
  console.log("Trove states updated for selected accounts")

  // Process accounts in batches using our utility
  const results = await processBatchTransactions(
    testAccounts,
    async (account, index) => {
      const musdAmount = ethers.parseEther(
        MUSD_AMOUNTS[index % MUSD_AMOUNTS.length],
      )

      console.log(
        `Processing account ${index + 1}/${testAccounts.length}: ${account.address}`,
      )
      console.log(`Borrowing additional ${ethers.formatEther(musdAmount)} MUSD`)

      // Get current trove state for reference
      let troveState
      let adjustedMusdAmount = musdAmount

      try {
        troveState = await troveManager.Troves(account.address)
        const totalDebt = troveState.principal + troveState.interestOwed
        console.log(
          `Current trove collateral: ${ethers.formatEther(troveState.coll)} BTC`,
        )
        console.log(`Current trove debt: ${ethers.formatEther(totalDebt)} MUSD`)

        // Calculate current ICR
        const icr = (troveState.coll * currentPrice * 100n) / totalDebt
        console.log(`Current ICR: ${icr / 100n}.${icr % 100n}%`)

        // Calculate new ICR after borrowing
        const newTotalDebt = totalDebt + adjustedMusdAmount
        const newIcr = (troveState.coll * currentPrice * 100n) / newTotalDebt
        console.log(
          `Projected ICR after borrowing: ${newIcr / 100n}.${newIcr % 100n}%`,
        )

        // Check if new ICR would be too low (below 111% to add some margin for error)
        if (newIcr < 11100n) {
          console.log(
            "Warning: New ICR would be too low. Reducing borrow amount.",
          )
          // Calculate a safer amount to borrow (targeting 120% ICR)
          const saferDebt = (troveState.coll * currentPrice * 100n) / 12000n
          const saferBorrowAmount =
            saferDebt > totalDebt ? saferDebt - totalDebt : 0n

          if (saferBorrowAmount > 0n) {
            console.log(
              `Adjusted borrow amount to ${ethers.formatEther(saferBorrowAmount)} MUSD`,
            )
            adjustedMusdAmount = saferBorrowAmount
          } else {
            console.log("Cannot safely borrow more. Skipping this account.")
            return {
              success: false,
              account: account.address,
              musdAmount: ethers.formatEther(musdAmount),
              error: "ICR would be too low",
            }
          }
        }
      } catch (error) {
        console.log(`Could not fetch current trove state: ${error.message}`)
        return {
          success: false,
          account: account.address,
          musdAmount: ethers.formatEther(musdAmount),
          error: `Could not fetch trove state: ${error.message}`,
        }
      }

      // Get the wallet
      const wallet = walletHelper.getWallet(account.address)

      if (!wallet) {
        console.log(`No wallet found for account ${account.address}, skipping`)
        return {
          success: false,
          account: account.address,
          musdAmount: ethers.formatEther(adjustedMusdAmount),
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
          debtAmount: adjustedMusdAmount,
          operation: "adjust",
          isCollIncrease: false,
          isDebtIncrease: true,
          currentCollateral: troveState?.coll,
          currentDebt:
            (troveState?.principal ?? 0n) + (troveState?.interestOwed ?? 0n),
          verbose: true,
        })

        // Record the start time
        const startTime = Date.now()

        // Increase debt transaction
        const tx = await borrowerOperations
          .connect(wallet)
          .withdrawMUSD(adjustedMusdAmount, upperHint, lowerHint, {
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
        stateManager.recordAction(account.address, "increaseDebt", TEST_ID)

        return {
          success: true,
          hash: tx.hash,
          account: account.address,
          musdAmount: ethers.formatEther(adjustedMusdAmount),
          gasUsed,
          duration,
        }
      } catch (error) {
        console.log(`Error increasing debt: ${error.message}`)

        return {
          success: false,
          account: account.address,
          musdAmount: ethers.formatEther(adjustedMusdAmount),
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
          musdAmounts: MUSD_AMOUNTS,
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
  await stateManager.updateTroveStates(troveManagerAddress, addresses, 200)

  // Update MUSD balances
  console.log("Updating MUSD balances for all accounts...")
  const musdAddress = await getDeploymentAddress("MUSD")
  await stateManager.updateMusdBalances(musdAddress)

  // Update BTC balances
  const updatedBalances = await stateManager.updateBtcBalances()
  console.log(`Updated BTC balances for ${updatedBalances} accounts`)

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
