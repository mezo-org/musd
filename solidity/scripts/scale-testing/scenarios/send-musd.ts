// scripts/scale-testing/scenarios/send-musd.ts
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
const TEST_ID = "send-musd-test"
const NUM_SENDER_ACCOUNTS = 5 // Number of accounts to use as senders
const MUSD_AMOUNTS = ["50", "75", "100", "125", "150"] // MUSD amounts to send
const BATCH_SIZE = 5 // Number of transactions to send in parallel

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Send MUSD test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)
  console.log(`Batch size: ${BATCH_SIZE}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  // Get contract addresses
  const musdAddress = await getDeploymentAddress("MUSD")
  const troveManagerAddress = await getDeploymentAddress("TroveManager")

  console.log(`Using MUSD at: ${musdAddress}`)
  console.log(`Using TroveManager at: ${troveManagerAddress}`)

  // Get contract instances
  const musdToken = await ethers.getContractAt("MUSD", musdAddress)

  // Update MUSD balances before selecting accounts
  console.log("Updating MUSD balances for all accounts...")
  await stateManager.updateMusdBalances(musdAddress)
  console.log("MUSD balances updated")

  // Update trove states
  console.log("Updating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)
  console.log("Trove states updated")

  // Select sender accounts - accounts that HAVE MUSD
  const senderAccounts = stateManager.getAccounts({
    minMusdBalance: "50", // Minimum MUSD balance to be a sender
    notUsedInTest: TEST_ID,
    limit: NUM_SENDER_ACCOUNTS,
  })

  console.log(`Selected ${senderAccounts.length} sender accounts with MUSD`)

  if (senderAccounts.length === 0) {
    console.error(
      "No accounts with sufficient MUSD found. Run increase-debt test first.",
    )
    process.exit(1)
  }

  // Get all accounts with troves
  const allTroveAccounts = stateManager.getAccounts({
    hasTrove: true,
  })

  console.log(`Found ${allTroveAccounts.length} total accounts with troves`)

  // Create a mapping of senders to receivers
  const transfers = []

  for (let i = 0; i < senderAccounts.length; i++) {
    const senderAccount = senderAccounts[i]

    // Find accounts that aren't this sender
    const possibleReceivers = allTroveAccounts.filter(
      (account) => account.address !== senderAccount.address,
    )

    if (possibleReceivers.length > 0) {
      // Pick a receiver (using a deterministic approach)
      const receiverIndex = i % possibleReceivers.length
      const receiverAccount = possibleReceivers[receiverIndex]

      transfers.push({
        sender: senderAccount,
        receiver: receiverAccount,
      })
    }
  }

  console.log(`Created ${transfers.length} transfer pairs`)

  // Load wallets for sender accounts
  const senderAddressesForWallets = senderAccounts.map(
    (account) => account.address,
  )
  const loadedSenderWallets = await walletHelper.loadEncryptedWallets(
    senderAddressesForWallets,
  )
  console.log(`Loaded ${loadedSenderWallets} sender wallets for testing`)

  // Process transfers in batches
  const results = await processBatchTransactions(
    transfers,
    async (transfer, index) => {
      const senderAccount = transfer.sender
      const receiverAccount = transfer.receiver
      let musdAmount = ethers.parseEther(
        MUSD_AMOUNTS[index % MUSD_AMOUNTS.length],
      )

      console.log(`Processing transfer ${index + 1}/${transfers.length}`)
      console.log(`Sender: ${senderAccount.address}`)
      console.log(`Receiver: ${receiverAccount.address}`)
      console.log(`Amount: ${ethers.formatEther(musdAmount)} MUSD`)

      // Get current MUSD balances for reference
      try {
        const senderBalance = await musdToken.balanceOf(senderAccount.address)
        const receiverBalance = await musdToken.balanceOf(
          receiverAccount.address,
        )

        console.log(
          `Sender MUSD balance: ${ethers.formatEther(senderBalance)} MUSD`,
        )
        console.log(
          `Receiver MUSD balance: ${ethers.formatEther(receiverBalance)} MUSD`,
        )

        // Check if sender has enough MUSD
        if (senderBalance < musdAmount) {
          console.log("Sender doesn't have enough MUSD. Adjusting amount...")
          // Use 90% of available balance if not enough
          if (senderBalance > 0) {
            const adjustedAmount = (senderBalance * 90n) / 100n
            console.log(
              `Adjusted amount: ${ethers.formatEther(adjustedAmount)} MUSD`,
            )
            // Update the amount to use
            musdAmount = adjustedAmount
          } else {
            console.log("Sender has no MUSD, skipping")
            return {
              success: false,
              sender: senderAccount.address,
              receiver: receiverAccount.address,
              musdAmount: ethers.formatEther(musdAmount),
              error: "Sender has no MUSD",
            }
          }
        }
      } catch (error) {
        console.log(`Error checking balances: ${error.message}`)
        return {
          success: false,
          sender: senderAccount.address,
          receiver: receiverAccount.address,
          musdAmount: ethers.formatEther(musdAmount),
          error: `Error checking balances: ${error.message}`,
        }
      }

      // Get the wallet for sender
      const senderWallet = walletHelper.getWallet(senderAccount.address)

      if (!senderWallet) {
        console.log(
          `No wallet found for sender ${senderAccount.address}, skipping`,
        )
        return {
          success: false,
          sender: senderAccount.address,
          receiver: receiverAccount.address,
          musdAmount: ethers.formatEther(musdAmount),
          error: "No wallet found for sender",
        }
      }

      try {
        // Record the start time
        const startTime = Date.now()

        // Send MUSD transaction
        const tx = await musdToken
          .connect(senderWallet)
          .transfer(receiverAccount.address, musdAmount, {
            gasLimit: 500000, // Explicitly set a gas limit
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

        // Record the action in the state manager for both accounts
        stateManager.recordAction(senderAccount.address, "sendMusd", TEST_ID)
        stateManager.recordAction(
          receiverAccount.address,
          "receiveMusd",
          TEST_ID,
        )

        return {
          success: true,
          hash: tx.hash,
          sender: senderAccount.address,
          receiver: receiverAccount.address,
          musdAmount: ethers.formatEther(musdAmount),
          gasUsed,
          duration,
        }
      } catch (error) {
        console.log(`Error sending MUSD: ${error.message}`)
        return {
          success: false,
          sender: senderAccount.address,
          receiver: receiverAccount.address,
          musdAmount: ethers.formatEther(musdAmount),
          error: error.message,
        }
      }
    },
    { testId: TEST_ID, batchSize: BATCH_SIZE },
  )

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total transfers attempted: ${transfers.length}`)
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
          numSenderAccounts: NUM_SENDER_ACCOUNTS,
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

  // Update MUSD balances after transfers
  console.log("\nUpdating MUSD balances for all accounts...")
  await stateManager.updateMusdBalances(musdAddress)

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
