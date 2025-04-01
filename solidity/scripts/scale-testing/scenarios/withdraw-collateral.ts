// scripts/scale-testing/scenarios/withdraw-collateral.ts
import { ethers } from "hardhat"
import { StateManager } from "../state-manager"
import { WalletHelper } from "../wallet-helper"
import { getDeploymentAddress } from "../../deployment-helpers"

// Configuration
const TEST_ID = "withdraw-collateral-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use
const WITHDRAWAL_PERCENTAGES = [5, 10, 15, 20, 25] // Percentage of collateral to withdraw

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Withdraw Collateral test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  // Get contract addresses
  const borrowerOperationsAddress =
    await getDeploymentAddress("BorrowerOperations")
  const troveManagerAddress = await getDeploymentAddress("TroveManager")
  const priceFeedAddress = await getDeploymentAddress("PriceFeed")

  console.log(`Using BorrowerOperations at: ${borrowerOperationsAddress}`)
  console.log(`Using TroveManager at: ${troveManagerAddress}`)
  console.log(`Using PriceFeed at: ${priceFeedAddress}`)

  // Get contract instances
  const borrowerOperations = await ethers.getContractAt(
    "BorrowerOperations",
    borrowerOperationsAddress,
  )
  const troveManager = await ethers.getContractAt(
    "TroveManager",
    troveManagerAddress,
  )
  const priceFeed = await ethers.getContractAt("PriceFeed", priceFeedAddress)

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

  // Initialize results object
  const results = {
    successful: 0,
    failed: 0,
    gasUsed: BigInt(0),
    transactions: [],
  }

  // Process each account
  for (let i = 0; i < testAccounts.length; i++) {
    const account = testAccounts[i]
    const withdrawalPercentage =
      WITHDRAWAL_PERCENTAGES[i % WITHDRAWAL_PERCENTAGES.length]

    console.log(
      `\nProcessing account ${i + 1}/${testAccounts.length}: ${account.address}`,
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
      results.failed++
      results.transactions.push({
        account: account.address,
        withdrawalPercentage,
        error: `Could not fetch trove state: ${error.message}`,
      })
      continue
    }

    // Calculate withdrawal amount (percentage of collateral)
    let withdrawAmount =
      (troveCollateral * BigInt(withdrawalPercentage)) / BigInt(100)
    console.log(
      `Target withdrawal amount (${withdrawalPercentage}% of collateral): ${ethers.formatEther(withdrawAmount)} BTC`,
    )

    // Calculate current ICR (Individual Collateral Ratio)
    const currentICR = (troveCollateral * currentPrice) / troveDebt
    console.log(`Current ICR: ${ethers.formatEther(currentICR * BigInt(100))}%`)

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
        results.failed++
        results.transactions.push({
          account: account.address,
          withdrawalPercentage,
          error: "Cannot maintain minimum ICR",
        })
        continue
      }

      // Apply a safety buffer (95% of max)
      withdrawAmount = (maxWithdrawal * 95n) / 100n
      console.log(
        `Adjusted withdrawal to: ${ethers.formatEther(withdrawAmount)} BTC (to maintain minimum ICR)`,
      )

      // Recalculate projected ICR
      const adjustedNewCollateral = troveCollateral - withdrawAmount
      const adjustedNewICR = (adjustedNewCollateral * currentPrice) / troveDebt
      console.log(
        `Adjusted projected ICR: ${ethers.formatEther(adjustedNewICR * BigInt(100))}%`,
      )
    }

    // Skip if withdrawal amount is too small
    if (withdrawAmount <= 0) {
      console.log("Withdrawal amount is zero or negative. Skipping.")
      results.failed++
      results.transactions.push({
        account: account.address,
        withdrawalPercentage,
        error: "Withdrawal amount is zero or negative",
      })
      continue
    }

    console.log(
      `Final withdrawal amount: ${ethers.formatEther(withdrawAmount)} BTC`,
    )

    // Get the wallet
    const wallet = walletHelper.getWallet(account.address)

    if (!wallet) {
      console.log(`No wallet found for account ${account.address}, skipping`)
      results.failed++
      results.transactions.push({
        account: account.address,
        withdrawalPercentage,
        withdrawAmount: ethers.formatEther(withdrawAmount),
        error: "No wallet found for account",
      })
      continue
    }

    try {
      // Record the start time
      const startTime = Date.now()

      // Withdraw collateral
      console.log("Withdrawing collateral...")
      const tx = await borrowerOperations
        .connect(wallet)
        .withdrawColl(withdrawAmount, ethers.ZeroAddress, ethers.ZeroAddress, {
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

      // Update results
      results.successful++
      results.gasUsed += gasUsed
      results.transactions.push({
        hash: tx.hash,
        account: account.address,
        withdrawalPercentage,
        withdrawAmount: ethers.formatEther(withdrawAmount),
        gasUsed: gasUsed.toString(),
        duration,
      })

      // Record the action in the state manager
      stateManager.recordAction(account.address, "withdrawCollateral", TEST_ID)
    } catch (error) {
      console.log(`Error withdrawing collateral: ${error.message}`)
      results.failed++
      results.transactions.push({
        account: account.address,
        withdrawalPercentage,
        withdrawAmount: ethers.formatEther(withdrawAmount),
        error: error.message,
      })
    }

    // Wait a bit between transactions to avoid network congestion
    if (i < testAccounts.length - 1) {
      console.log("Waiting 2 seconds before next transaction...")
      await new Promise((resolve) => {
        setTimeout(resolve, 2000)
      })
    }
  }

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total accounts processed: ${testAccounts.length}`)
  console.log(`Successful: ${results.successful}`)
  console.log(`Failed: ${results.failed}`)
  console.log(`Total gas used: ${results.gasUsed}`)
  console.log(
    `Average gas per transaction: ${results.successful > 0 ? results.gasUsed / BigInt(results.successful) : BigInt(0)}`,
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
          withdrawalPercentages: WITHDRAWAL_PERCENTAGES,
        },
        results: {
          successful: results.successful,
          failed: results.failed,
          gasUsed: results.gasUsed.toString(),
          averageGas:
            results.successful > 0
              ? (results.gasUsed / BigInt(results.successful)).toString()
              : "0",
        },
        transactions: results.transactions,
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
