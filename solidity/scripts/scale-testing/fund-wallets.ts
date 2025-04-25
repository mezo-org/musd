import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"
import { processBatchTransactions } from "./batch-transactions"

// Configuration
const BTC_PER_WALLET = "0.001"
const OUTPUT_DIR = path.join(__dirname, "..", "..", "scale-testing")
const WALLETS_FILE = path.join(OUTPUT_DIR, "wallets.json")
const MAX_RETRIES = 5
const BATCH_SIZE = 5

async function main() {
  // Load wallet addresses
  if (!fs.existsSync(WALLETS_FILE)) {
    throw new Error(
      `Wallets file not found at ${WALLETS_FILE}. Run generate-wallets.ts first.`,
    )
  }

  const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"))
  console.log(`Loaded ${wallets.length} wallet addresses`)

  // Get the funding account
  const [funder] = await ethers.getSigners()
  console.log(`Using funder account: ${funder.address}`)

  // Check funder balance
  const funderBalance = await ethers.provider.getBalance(funder.address)
  const requiredBalance =
    ethers.parseEther(BTC_PER_WALLET) * BigInt(wallets.length)

  console.log(`Funder balance: ${ethers.formatEther(funderBalance)} BTC`)
  console.log(`Required balance: ${ethers.formatEther(requiredBalance)} BTC`)

  if (funderBalance < requiredBalance) {
    throw new Error(
      `Insufficient funds. Need ${ethers.formatEther(requiredBalance)} BTC but have ${ethers.formatEther(funderBalance)} BTC`,
    )
  }

  // Function to send a transaction with retry logic
  async function sendWithRetry(
    walletAddress: string,
    retryCount = 0,
  ): Promise<boolean> {
    if (retryCount >= MAX_RETRIES) {
      console.log(
        `Maximum retries reached for wallet ${walletAddress}, skipping.`,
      )
      return false
    }

    try {
      console.log(
        `Attempt ${retryCount + 1}/${MAX_RETRIES}: Sending ${BTC_PER_WALLET} BTC to ${walletAddress}...`,
      )

      // Send transaction
      const tx = await funder.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(BTC_PER_WALLET),
        gasLimit: 30000,
      })

      console.log(`Transaction sent: ${tx.hash}`)

      // Wait for confirmation
      const receipt = await tx.wait()
      console.log(`Transaction confirmed in block ${receipt?.blockNumber}`)
      return true
    } catch (error) {
      console.error("Error:", error.message)

      // Retry after a delay
      console.log("Waiting 2 seconds before retry...")
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return sendWithRetry(walletAddress, retryCount + 1)
    }
  }

  // Process wallets in batches
  const results = await processBatchTransactions(
    wallets,
    async (wallet, index) => {
      console.log(
        `\nProcessing wallet ${index + 1}/${wallets.length}: ${wallet.address}`,
      )

      // Check if this wallet already has funds
      const balance = await ethers.provider.getBalance(wallet.address)
      if (balance >= ethers.parseEther(BTC_PER_WALLET)) {
        console.log(
          `Wallet already has ${ethers.formatEther(balance)} BTC, skipping.`,
        )
        return {
          success: true,
          account: wallet.address,
          message: "Already funded",
        }
      }

      // Try to fund this wallet
      const success = await sendWithRetry(wallet.address)
      return {
        success,
        account: wallet.address,
        message: success ? "Funding successful" : "Funding failed",
      }
    },
    { testId: "fund-wallets", batchSize: BATCH_SIZE },
  )

  // Print summary
  console.log("\n--- Funding Summary ---")
  console.log(`Total wallets: ${wallets.length}`)
  console.log(`Successful: ${results.successful}`)
  console.log(`Failed: ${results.failed}`)
  console.log(`Skipped: ${results.skipped}`)

  console.log("Funding process completed.")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in main function:", error)
    process.exit(1)
  })
