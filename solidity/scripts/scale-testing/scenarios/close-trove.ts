// scripts/scale-testing/scenarios/close-trove.ts
import { ethers } from "hardhat"
import fs from "fs"
import path from "path"
import StateManager from "../state-manager"
import WalletHelper from "../wallet-helper"
import getDeploymentAddress from "../../deployment-helpers"
import {
  processBatchTransactions,
  prepareResultsForSerialization,
} from "../batch-transactions"

// Configuration
const TEST_ID = "close-trove-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use
const BATCH_SIZE = 5 // Number of transactions to send in parallel

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Close Trove test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)
  console.log(`Batch size: ${BATCH_SIZE}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  // Get contract addresses
  const borrowerOperationsAddress =
    await getDeploymentAddress("BorrowerOperations")
  const troveManagerAddress = await getDeploymentAddress("TroveManager")
  const musdAddress = await getDeploymentAddress("MUSD")

  console.log(`Using BorrowerOperations at: ${borrowerOperationsAddress}`)
  console.log(`Using TroveManager at: ${troveManagerAddress}`)
  console.log(`Using MUSD at: ${musdAddress}`)

  // Get contract instances
  const borrowerOperations = await ethers.getContractAt(
    "BorrowerOperations",
    borrowerOperationsAddress,
  )
  const troveManager = await ethers.getContractAt(
    "TroveManager",
    troveManagerAddress,
  )
  const musdToken = await ethers.getContractAt("MUSD", musdAddress)

  // Update trove states before selecting accounts
  console.log("Updating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)
  console.log("Trove states updated")

  // Update MUSD balances
  console.log("Updating MUSD balances for all accounts...")
  await stateManager.updateMusdBalances(musdAddress)
  console.log("MUSD balances updated")

  // Select accounts for testing - accounts that HAVE troves
  const testAccounts = stateManager.getAccounts({
    hasTrove: true,
    minInterestRate: "0.01", // Testing specifically accounts with interest
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS * 2, // Get more accounts than needed in case some can't be used
  })

  console.log(
    `Selected ${testAccounts.length} accounts with troves for testing`,
  )

  if (testAccounts.length === 0) {
    console.error("No accounts with troves found.")
    process.exit(1)
  }

  // Get all accounts with MUSD for potential donors
  const allAccountsWithMusd = stateManager.getAccounts({
    minMusdBalance: "500", // Minimum MUSD balance to be considered as a donor
  })

  console.log(
    `Found ${allAccountsWithMusd.length} accounts with MUSD that could be donors`,
  )

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Also load wallets for potential donor accounts
  const donorAddresses = allAccountsWithMusd.map((account) => account.address)
  const loadedDonorWallets =
    await walletHelper.loadEncryptedWallets(donorAddresses)
  console.log(
    `Loaded ${loadedDonorWallets} donor wallets for potential transfers`,
  )

  // First phase: prepare accounts by ensuring they have enough MUSD to close troves
  console.log("\nPreparing accounts - ensuring sufficient MUSD balances...")
  const preparedAccounts = []
  let skippedAccounts = 0

  for (
    let i = 0;
    i < testAccounts.length && preparedAccounts.length < NUM_ACCOUNTS;
    i++
  ) {
    const account = testAccounts[i]
    console.log(
      `\nPreparing account ${i + 1}/${testAccounts.length}: ${account.address}`,
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
        `Current trove principal: ${ethers.formatEther(troveState.principal)} MUSD`,
      )
      console.log(
        `Current trove interest owed: ${ethers.formatEther(troveState.interestOwed)} MUSD`,
      )
      console.log(
        `Current trove total debt: ${ethers.formatEther(troveDebt)} MUSD`,
      )
    } catch (error) {
      console.log(`Could not fetch current trove state: ${error.message}`)
      skippedAccounts++
      continue
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
      skippedAccounts++
      continue
    }

    // Check if account has enough MUSD to close the trove
    if (musdBalance < troveDebt) {
      console.log("Account doesn't have enough MUSD to close the trove")
      console.log(
        `Required: ${ethers.formatEther(troveDebt)} MUSD, Available: ${ethers.formatEther(musdBalance)} MUSD`,
      )

      // Calculate how much more MUSD is needed
      const musdNeeded = troveDebt - musdBalance
      console.log("Attempting to get more MUSD for this account...")
      console.log(
        `Looking for an account with at least ${ethers.formatEther(musdNeeded)} MUSD (excluding self)`,
      )

      // Find potential donor accounts (excluding self)
      const potentialDonors = allAccountsWithMusd.filter(
        (donor) =>
          donor.address.toLowerCase() !== account.address.toLowerCase() &&
          parseFloat(donor.musdBalance) >=
            parseFloat(ethers.formatEther(musdNeeded)),
      )

      console.log(`Found ${potentialDonors.length} potential donor accounts`)

      if (potentialDonors.length === 0) {
        console.log("No suitable donor accounts found. Skipping this account.")
        skippedAccounts++
        continue
      }

      // Select a donor
      const donorAccount = potentialDonors[0]
      console.log(
        `Selected donor account: ${donorAccount.address} with ${donorAccount.musdBalance} MUSD`,
      )

      // Verify donor's on-chain balance
      let donorOnChainBalance
      try {
        donorOnChainBalance = await musdToken.balanceOf(donorAccount.address)
        console.log(
          `Donor MUSD balance (on-chain): ${ethers.formatEther(donorOnChainBalance)} MUSD`,
        )

        if (donorOnChainBalance < musdNeeded) {
          console.log(
            "Donor doesn't have enough MUSD on-chain. Skipping this account.",
          )
          skippedAccounts++
          continue
        }
      } catch (error) {
        console.log(
          `Could not fetch donor's on-chain balance: ${error.message}`,
        )
        skippedAccounts++
        continue
      }

      // Get donor wallet
      const donorWallet = walletHelper.getWallet(donorAccount.address)
      if (!donorWallet) {
        console.log(
          `No wallet found for donor account ${donorAccount.address}. Skipping.`,
        )
        skippedAccounts++
        continue
      }

      // Transfer MUSD from donor to account
      try {
        console.log(
          `Transferring ${ethers.formatEther(musdNeeded)} MUSD from donor to account...`,
        )
        const transferTx = await musdToken
          .connect(donorWallet)
          .transfer(account.address, musdNeeded)
        console.log(`Transfer transaction sent: ${transferTx.hash}`)
        await transferTx.wait()
        console.log(`Transfer complete! Transaction: ${transferTx.hash}`)

        // Update the balance
        musdBalance = await musdToken.balanceOf(account.address)
        console.log(
          `Updated MUSD balance: ${ethers.formatEther(musdBalance)} MUSD`,
        )
      } catch (error) {
        console.log(`Error trying to get more MUSD: ${error}`)
        skippedAccounts++
        continue
      }

      // Check again if we have enough MUSD now
      if (musdBalance < troveDebt) {
        console.log("Still not enough MUSD to close the trove. Skipping.")
        skippedAccounts++
        continue
      }
    }

    // Get the wallet
    const wallet = walletHelper.getWallet(account.address)

    if (!wallet) {
      console.log(`No wallet found for account ${account.address}, skipping`)
      skippedAccounts++
      continue
    }

    // Account is ready to close trove
    preparedAccounts.push({
      account,
      troveCollateral,
      troveDebt,
    })

    // Stop if we have enough prepared accounts
    if (preparedAccounts.length >= NUM_ACCOUNTS) {
      break
    }
  }

  console.log(
    `\nPrepared ${preparedAccounts.length} accounts for closing troves`,
  )
  console.log(`Skipped ${skippedAccounts} accounts during preparation`)

  if (preparedAccounts.length === 0) {
    console.error("No accounts prepared for trove closing!")
    process.exit(1)
  }

  // Second phase: close troves in batches
  console.log("\nProceeding to close troves in batches...")

  const results = await processBatchTransactions(
    preparedAccounts.map((item) => item.account),
    async (account, index) => {
      const { troveCollateral, troveDebt } = preparedAccounts[index]

      console.log(
        `Processing account ${index + 1}/${preparedAccounts.length}: ${account.address}`,
      )
      console.log(
        `Closing trove with debt: ${ethers.formatEther(troveDebt)} MUSD`,
      )

      // Get the wallet
      const wallet = walletHelper.getWallet(account.address)

      try {
        // Record the start time
        const startTime = Date.now()

        // Close the trove
        console.log("Closing trove...")
        const tx = await borrowerOperations.connect(wallet).closeTrove({
          gasLimit: 1500000, // Higher gas limit for complex operation
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
        stateManager.recordAction(account.address, "closeTrove", TEST_ID)

        return {
          success: true,
          hash: tx.hash,
          account: account.address,
          collateralReturned: ethers.formatEther(troveCollateral),
          debtRepaid: ethers.formatEther(troveDebt),
          gasUsed,
          duration,
        }
      } catch (error) {
        console.log(`Error closing trove: ${error.message}`)

        return {
          success: false,
          account: account.address,
          error: error.message,
        }
      }
    },
    { testId: TEST_ID, batchSize: BATCH_SIZE },
  )

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total accounts processed: ${preparedAccounts.length}`)
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
