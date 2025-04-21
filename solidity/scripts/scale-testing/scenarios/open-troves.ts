// scripts/scale-testing/scenarios/open-troves.ts
import { ethers } from "hardhat"
import fs from "fs"
import path from "path"
import StateManager from "../state-manager"
import WalletHelper from "../wallet-helper"
import calculateTroveOperationHints from "../hint-helper"
import getContracts from "../get-contracts"
import { processBatchTransactions } from "../batch-transactions"

// Configuration
const TEST_ID = "open-troves-test"
const NUM_ACCOUNTS = 20 // Number of accounts to use
const MIN_BTC_BALANCE = "0.0005" // Minimum BTC balance required
const MUSD_DEBT_AMOUNT = 2200 // Amount of MUSD debt to create - just over the minimum debt
const BATCH_SIZE = 5 // Number of transactions to send in parallel

// Collateral ratios to test (150%, 200%, 250%, 300%, 350%)
const COLLATERAL_RATIOS = [150, 200, 250, 300, 350]

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Open Troves test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)
  console.log(`Batch size: ${BATCH_SIZE}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper and load wallets
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
    console.log(
      "Could not fetch price from price feed, using default: $20000000",
    )
    currentPrice = ethers.parseEther("20000000")
  }

  // Get the minimum collateral ratio (MCR)
  let mcr
  try {
    mcr = await troveManager.MCR()
    console.log(
      `Minimum Collateral Ratio (MCR): ${ethers.formatEther(mcr) * 100}%`,
    )
  } catch (error) {
    console.log("Could not fetch MCR, using default: 110%")
    mcr = ethers.parseEther("1.1") // 110%
  }

  // Get the MUSD gas compensation amount
  let gasCompensation
  try {
    gasCompensation = await troveManager.MUSD_GAS_COMPENSATION()
    console.log(
      `MUSD Gas Compensation: ${ethers.formatEther(gasCompensation)} MUSD`,
    )
  } catch (error) {
    console.log("Could not fetch gas compensation, using default: 200 MUSD")
    gasCompensation = ethers.parseEther("200")
  }

  // Select accounts for testing
  const testAccounts = stateManager.getAccounts({
    minBtcBalance: MIN_BTC_BALANCE,
    hasTrove: false,
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS,
  })

  console.log(`Selected ${testAccounts.length} accounts for testing`)

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Process accounts in batches using our utility
  const results = await processBatchTransactions(
    testAccounts,
    async (account, index) => {
      const wallet = walletHelper.getWallet(account.address)

      if (!wallet) {
        console.log(`No wallet found for account ${account.address}, skipping`)
        return {
          success: false,
          account: account.address,
          error: "wallet not found - skipped",
        }
      }

      const signer = wallet

      // Get the target collateral ratio for this account
      const collateralRatio =
        COLLATERAL_RATIOS[index % COLLATERAL_RATIOS.length]

      console.log(
        `Preparing transaction for account ${index + 1}/${testAccounts.length}: ${account.address}`,
      )
      console.log(`Target collateral ratio: ${collateralRatio}%`)

      // Calculate the collateral needed for the desired debt and collateral ratio
      const debtAmount = ethers.parseEther(MUSD_DEBT_AMOUNT.toString())
      const totalDebt = debtAmount + gasCompensation // Add gas compensation to the debt

      // Convert collateral ratio from percentage to decimal (e.g., 150% -> 1.5)
      const collateralRatioDecimal = ethers.parseEther(
        (collateralRatio / 100).toString(),
      )

      // Calculate required collateral in BTC
      const collateralAmount =
        (totalDebt * collateralRatioDecimal) / currentPrice

      console.log(
        `Opening Trove with ${ethers.formatEther(collateralAmount)} BTC collateral and ${MUSD_DEBT_AMOUNT} MUSD debt`,
      )

      try {
        // Get hints for this transaction
        const { upperHint, lowerHint } = await calculateTroveOperationHints({
          hintHelpers,
          sortedTroves,
          troveManager,
          collateralAmount,
          debtAmount,
          operation: "open",
          verbose: true,
        })

        // Record the start time
        const startTime = Date.now()

        // Open Trove transaction
        const tx = await borrowerOperations.connect(signer).openTrove(
          debtAmount, // MUSD amount
          upperHint,
          lowerHint,
          {
            value: collateralAmount,
            gasLimit: 1500000, // Explicitly set a higher gas limit
          }, // Send BTC as collateral
        )

        console.log(
          `Transaction sent: ${tx.hash} for account ${account.address}`,
        )

        // Wait for transaction to be mined
        const receipt = await tx.wait()

        // Calculate metrics
        const endTime = Date.now()
        const duration = endTime - startTime
        const gasUsed = receipt ? receipt.gasUsed : 0n

        console.log(
          `Transaction confirmed for ${account.address}! Gas used: ${gasUsed}, Duration: ${duration}ms`,
        )

        // Record the action in the state manager
        stateManager.recordAction(account.address, "openTrove", TEST_ID)

        return {
          success: true,
          hash: tx.hash,
          account: account.address,
          collateralRatio,
          collateralAmount: ethers.formatEther(collateralAmount),
          debtAmount: MUSD_DEBT_AMOUNT,
          gasUsed,
          duration,
        }
      } catch (error) {
        console.log(
          `Error opening Trove for ${account.address}: ${error.message}`,
        )

        return {
          success: false,
          account: account.address,
          collateralRatio,
          collateralAmount: ethers.formatEther(collateralAmount),
          debtAmount: MUSD_DEBT_AMOUNT,
          error: error.message,
        }
      }
    },
    { testId: TEST_ID, batchSize: BATCH_SIZE },
  )

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total accounts: ${testAccounts.length}`)
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
          minBtcBalance: MIN_BTC_BALANCE,
          collateralRatios: COLLATERAL_RATIOS,
          musdDebtAmount: MUSD_DEBT_AMOUNT,
          batchSize: BATCH_SIZE,
        },
        results: {
          successful: results.successful,
          failed: results.failed,
          skipped: results.skipped,
          gasUsed: results.gasUsed.toString(),
          averageGas:
            results.successful > 0
              ? (results.gasUsed / BigInt(results.successful)).toString()
              : "0",
        },
        transactions: results.transactions.map((tx) => ({
          ...tx,
          gasUsed: tx.gasUsed ? tx.gasUsed.toString() : undefined,
        })),
      },
      null,
      2,
    ),
  )

  console.log(`Results saved to ${resultsFile}`)

  // Update all Trove states to ensure data is current
  console.log("\nUpdating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
