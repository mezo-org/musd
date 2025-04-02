import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

// Configuration
const BTC_PER_WALLET = "0.001" // Amount of BTC to send to each wallet
const OUTPUT_DIR = path.join(__dirname, "..", "..", "scale-testing")
const WALLETS_FILE = path.join(OUTPUT_DIR, "wallets.json")
const MAX_RETRIES = 5 // Maximum number of retries per wallet

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

  // Fund wallets one by one with smart retry logic
  const ethAmount = ethers.parseEther(BTC_PER_WALLET)
  let fundedCount = 0
  const fundedWallets = []

  console.log(`\nFunding wallets with ${BTC_PER_WALLET} BTC each...`)

  // Function to get the current nonce with retry logic
  async function getCurrentNonce() {
    // Try multiple times to get a consistent nonce
    const nonce = await ethers.provider.getTransactionCount(
      funder.address,
      "pending",
    )
    const confirmedNonce = await ethers.provider.getTransactionCount(
      funder.address,
      "latest",
    )

    console.log(`Nonce check - Pending: ${nonce}, Confirmed: ${confirmedNonce}`)

    // If pending and confirmed nonces differ, use the higher value to be safe
    return Math.max(nonce, confirmedNonce)
  }

  // Function to send a transaction with smart retry logic
  async function sendWithRetry(walletAddress, retryCount = 0) {
    if (retryCount >= MAX_RETRIES) {
      console.log(
        `Maximum retries reached for wallet ${walletAddress}, skipping.`,
      )
      return false
    }

    try {
      // Get current nonce
      const nonce = await getCurrentNonce()
      console.log(
        `Attempt ${retryCount + 1}/${MAX_RETRIES}: Sending ${BTC_PER_WALLET} BTC to ${walletAddress} with nonce ${nonce}...`,
      )

      // Send transaction
      const tx = await funder.sendTransaction({
        to: walletAddress,
        value: ethAmount,
        nonce,
        gasLimit: 30000,
      })

      console.log(`Transaction sent: ${tx.hash}`)

      // Wait for confirmation
      const receipt = await tx.wait()
      console.log(`Transaction confirmed in block ${receipt?.blockNumber}`)
      return true
    } catch (error) {
      console.error("Error:", error.message)

      // If it's a nonce error, try incrementing the nonce
      if (error.message.includes("invalid nonce")) {
        // Extract the expected nonce from the error message if possible
        const match = error.message.match(/expected (\d+)/)
        let nextNonce

        if (match && match[1]) {
          // Use the nonce suggested in the error message
          nextNonce = parseInt(match[1])
          console.log(`Error suggests using nonce ${nextNonce}`)
        } else {
          // If we can't extract it, just increment by 1
          nextNonce = (await getCurrentNonce()) + 1
          console.log(`Incrementing to nonce ${nextNonce}`)
        }

        // Force the provider to refresh its nonce tracking
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Retry with the new nonce
        try {
          console.log(`Retrying with explicit nonce ${nextNonce}...`)
          const tx = await funder.sendTransaction({
            to: walletAddress,
            value: ethAmount,
            nonce: nextNonce,
            gasLimit: 30000,
          })

          console.log(`Transaction sent: ${tx.hash}`)
          const receipt = await tx.wait()
          console.log(`Transaction confirmed in block ${receipt?.blockNumber}`)
          return true
        } catch (retryError) {
          console.error("Retry failed:", retryError.message)
          // Wait a bit longer before the next retry
          await new Promise((resolve) => setTimeout(resolve, 2000))
          // Recursive retry with incremented counter
          return sendWithRetry(walletAddress, retryCount + 1)
        }
      } else {
        // For other errors, just retry after a delay
        console.log("Waiting 2 seconds before retry...")
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return sendWithRetry(walletAddress, retryCount + 1)
      }
    }
  }

  // Process each wallet
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i]
    console.log(
      `\nProcessing wallet ${i + 1}/${wallets.length}: ${wallet.address}`,
    )

    // Check if this wallet already has funds
    const balance = await ethers.provider.getBalance(wallet.address)
    if (balance >= ethAmount) {
      console.log(
        `Wallet already has ${ethers.formatEther(balance)} BTC, skipping.`,
      )
      fundedCount++
      fundedWallets.push(wallet.address)
      continue
    }

    // Try to fund this wallet
    const success = await sendWithRetry(wallet.address)

    if (success) {
      fundedCount++
      fundedWallets.push(wallet.address)
      console.log(
        `Successfully funded ${fundedCount}/${wallets.length} wallets so far.`,
      )
    } else {
      console.log(
        `Failed to fund wallet ${wallet.address} after multiple attempts.`,
      )
    }

    // Add a small delay between wallets
    if (i < wallets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  console.log(
    `\nFunding complete. ${fundedCount}/${wallets.length} wallets funded with ${BTC_PER_WALLET} BTC each.`,
  )

  // Update wallet file with funding status
  const updatedWallets = wallets.map((wallet) => ({
    ...wallet,
    funded: fundedWallets.includes(wallet.address),
    fundedAmount: fundedWallets.includes(wallet.address) ? BTC_PER_WALLET : "0",
    fundedAt: fundedWallets.includes(wallet.address)
      ? new Date().toISOString()
      : null,
  }))

  fs.writeFileSync(WALLETS_FILE, JSON.stringify(updatedWallets, null, 2))
  console.log(`Updated wallet information saved to ${WALLETS_FILE}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in main function:", error)
    process.exit(1)
  })
