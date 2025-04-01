// scripts/scale-testing/scenarios/add-collateral.ts
import { ethers } from "hardhat"
import { StateManager } from "../state-manager"
import { WalletHelper } from "../wallet-helper"
import { getDeploymentAddress } from "../../deployment-helpers"

// Configuration
const TEST_ID = "add-collateral-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use
const COLLATERAL_AMOUNTS = ["0.0001", "0.0002", "0.0003", "0.0004", "0.0005"] // BTC amounts to add

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Add Collateral test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  // Get contract addresses
  const borrowerOperationsAddress =
    await getDeploymentAddress("BorrowerOperations")
  const troveManagerAddress = await getDeploymentAddress("TroveManager")

  console.log(`Using BorrowerOperations at: ${borrowerOperationsAddress}`)
  console.log(`Using TroveManager at: ${troveManagerAddress}`)

  // Get contract instances
  const borrowerOperations = await ethers.getContractAt(
    "BorrowerOperations",
    borrowerOperationsAddress,
  )
  const troveManager = await ethers.getContractAt(
    "TroveManager",
    troveManagerAddress,
  )

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
    `Selected ${testAccounts.length} accounts with existing troves for testing`,
  )

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Initialize results object
  const results = {
    successful: 0,
    failed: 0,
    gasUsed: 0n,
    transactions: [] as any[],
  }

  // Process each account
  for (let i = 0; i < testAccounts.length; i++) {
    const account = testAccounts[i]
    const collateralAmount = ethers.parseEther(
      COLLATERAL_AMOUNTS[i % COLLATERAL_AMOUNTS.length],
    )

    console.log(
      `\nProcessing account ${i + 1}/${testAccounts.length}: ${account.address}`,
    )
    console.log(`Adding ${ethers.formatEther(collateralAmount)} BTC collateral`)

    // Get current trove state for reference
    try {
      const troveState = await troveManager.Troves(account.address)
      console.log(
        `Current trove collateral: ${ethers.formatEther(troveState.coll)} BTC`,
      )
      console.log(
        `Current trove principal: ${ethers.formatEther(troveState.principal)} MUSD`,
      )
      console.log(
        `Current trove interest owned: ${ethers.formatEther(troveState.interestOwed)} MUSD`,
      )
    } catch (error) {
      console.log(`Could not fetch current trove state: ${error.message}`)
    }

    // Get the wallet
    const wallet = walletHelper.getWallet(account.address)

    if (!wallet) {
      console.log(`No wallet found for account ${account.address}, skipping`)
      results.failed++
      results.transactions.push({
        account: account.address,
        collateralAmount: ethers.formatEther(collateralAmount),
        error: "No wallet found for account",
      })
      continue
    }

    try {
      // Record the start time
      const startTime = Date.now()

      // Add collateral transaction
      const tx = await borrowerOperations
        .connect(wallet)
        .addColl(ethers.ZeroAddress, ethers.ZeroAddress, {
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

      // Update results
      results.successful++
      results.gasUsed += gasUsed
      results.transactions.push({
        hash: tx.hash,
        account: account.address,
        collateralAmount: ethers.formatEther(collateralAmount),
        gasUsed: gasUsed.toString(),
        duration,
      })

      // Record the action in the state manager
      stateManager.recordAction(account.address, "addCollateral", TEST_ID)
    } catch (error) {
      console.log(`Error adding collateral: ${error.message}`)
      results.failed++
      results.transactions.push({
        account: account.address,
        collateralAmount: ethers.formatEther(collateralAmount),
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
    `Average gas per transaction: ${results.successful > 0 ? results.gasUsed / BigInt(results.successful) : 0n}`,
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
          collateralAmounts: COLLATERAL_AMOUNTS,
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

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
