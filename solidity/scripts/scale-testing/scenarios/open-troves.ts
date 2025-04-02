// scripts/scale-testing/scenarios/open-troves.ts
import { ethers } from "hardhat"
import { StateManager } from "../state-manager"
import { WalletHelper } from "../wallet-helper"
import { getDeploymentAddress } from "../../deployment-helpers"

// Configuration
const TEST_ID = "open-troves-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use
const MIN_BTC_BALANCE = "0.0005" // Minimum BTC balance required

// Collateral ratios to test (150%, 200%, 250%, 300%, 350%)
const COLLATERAL_RATIOS = [150, 200, 250, 300, 350]

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Open Troves test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper and load wallets
  const walletHelper = new WalletHelper()

  // Get contract addresses
  const borrowerOperationsAddress =
    await getDeploymentAddress("BorrowerOperations")
  const priceFeedAddress = await getDeploymentAddress("PriceFeed")

  console.log(`Using BorrowerOperations at: ${borrowerOperationsAddress}`)
  console.log(`Using PriceFeed at: ${priceFeedAddress}`)

  // Get contract instances
  const borrowerOperations = await ethers.getContractAt(
    "BorrowerOperations",
    borrowerOperationsAddress,
  )
  const priceFeed = await ethers.getContractAt("PriceFeed", priceFeedAddress)

  // Get the current BTC price from the price feed
  let currentPrice
  try {
    currentPrice = await priceFeed.fetchPrice()
    console.log(`Current BTC price: $${ethers.formatEther(currentPrice)}`)
  } catch (error) {
    console.log("Could not fetch price from price feed, using default: $50000")
    currentPrice = ethers.parseEther("50000")
  }

  // Select accounts for testing
  const testAccounts = stateManager.getAccounts({
    hasTrove: false,
    minBtcBalance: MIN_BTC_BALANCE,
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS,
  })

  if (testAccounts.length === 0) {
    console.error(
      "No suitable accounts found for testing. Make sure you have accounts with sufficient BTC and no active Troves.",
    )
    return
  }

  console.log(`Selected ${testAccounts.length} accounts for testing`)

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Results tracking
  const results = {
    successful: 0,
    failed: 0,
    gasUsed: 0,
    transactions: [],
  }

  // Process each account
  for (let i = 0; i < testAccounts.length; i++) {
    const account = testAccounts[i]
    console.log(
      `\nProcessing account ${i + 1}/${testAccounts.length}: ${account.address}`,
    )

    // Get the wallet for this account
    const wallet = walletHelper.getWallet(account.address)
    if (!wallet) {
      console.error(
        `Could not find wallet for account ${account.address}, skipping`,
      )
      continue
    }

    // Choose a collateral ratio for this account
    const collateralRatio = COLLATERAL_RATIOS[i % COLLATERAL_RATIOS.length]
    console.log(`Target collateral ratio: ${collateralRatio}%`)

    // Calculate collateral and debt amounts
    // For simplicity, we'll use a fixed debt amount and calculate the required collateral
    const debtAmount = ethers.parseEther("2000") // 1000 MUSD debt

    // Calculate required collateral: (debt * collateralRatio) / (price * 100)
    // The *100 is because collateralRatio is in percentage
    const collateralAmount =
      (debtAmount * BigInt(collateralRatio)) / (currentPrice * 100n)

    console.log(
      `Opening Trove with ${ethers.formatEther(collateralAmount)} BTC collateral and ${ethers.formatEther(debtAmount)} MUSD debt`,
    )

    try {
      // Record the start time
      const startTime = Date.now()

      // Open Trove transaction
      const tx = await borrowerOperations.connect(wallet).openTrove(
        debtAmount, // MUSD amount
        ethers.ZeroAddress, // Upper hint (use zero address for simplicity)
        ethers.ZeroAddress, // Lower hint (use zero address for simplicity)
        { value: collateralAmount }, // Send BTC as collateral
      )

      console.log(`Transaction sent: ${tx.hash}`)

      // Wait for transaction to be mined
      const receipt = await tx.wait()

      // Calculate metrics
      const endTime = Date.now()
      const duration = endTime - startTime
      const gasUsed = receipt ? Number(receipt.gasUsed) : 0

      console.log(
        `Transaction confirmed! Gas used: ${gasUsed}, Duration: ${duration}ms`,
      )

      // Update results
      results.successful++
      results.gasUsed += gasUsed
      results.transactions.push({
        hash: tx.hash,
        account: account.address,
        collateralRatio,
        collateral: ethers.formatEther(collateralAmount),
        debt: ethers.formatEther(debtAmount),
        gasUsed,
        duration,
      })

      // Record action in state manager
      stateManager.recordAction(account.address, "openTrove", TEST_ID)

      // Update account state
      const accountState = stateManager.getAccount(account.address)
      if (accountState) {
        accountState.hasTrove = true
        accountState.troveCollateral = ethers.formatEther(collateralAmount)
        accountState.troveDebt = ethers.formatEther(debtAmount)
        accountState.lastTroveUpdate = new Date().toISOString()
      }

      // Save state
      stateManager.saveState()
    } catch (error) {
      console.error(`Error opening Trove: ${error.message}`)
      results.failed++
    }

    // Add a small delay between transactions
    if (i < testAccounts.length - 1) {
      console.log("Waiting 2 seconds before next transaction...")
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total accounts: ${testAccounts.length}`)
  console.log(`Successful: ${results.successful}`)
  console.log(`Failed: ${results.failed}`)
  console.log(`Total gas used: ${results.gasUsed}`)
  console.log(
    `Average gas per transaction: ${results.successful > 0 ? Math.floor(results.gasUsed / results.successful) : 0}`,
  )

  // Save results to file
  const fs = require("fs")
  const path = require("path")
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
        },
        results,
        transactions: results.transactions,
      },
      null,
      2,
    ),
  )

  console.log(`Results saved to ${resultsFile}`)

  // Update all Trove states to ensure data is current
  console.log("\nUpdating Trove states for all accounts...")
  const troveManagerAddress = await getDeploymentAddress("TroveManager")
  await stateManager.updateTroveStates(troveManagerAddress)

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
