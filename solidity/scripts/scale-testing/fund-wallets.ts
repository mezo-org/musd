// scripts/scale-testing/fund-wallets-optimized.ts
import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

// Configuration
const BATCH_SIZE = 10 // Number of wallets to fund in parallel
const ETH_PER_WALLET = "0.001" // Amount of ETH to send to each wallet
const OUTPUT_DIR = path.join(__dirname, "..", "..", "scale-testing")
const WALLETS_FILE = path.join(OUTPUT_DIR, "wallets.json")

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
    ethers.parseEther(ETH_PER_WALLET) * BigInt(wallets.length)

  console.log(`Funder balance: ${ethers.formatEther(funderBalance)} ETH`)
  console.log(`Required balance: ${ethers.formatEther(requiredBalance)} ETH`)

  if (funderBalance < requiredBalance) {
    throw new Error(
      `Insufficient funds. Need ${ethers.formatEther(requiredBalance)} ETH but have ${ethers.formatEther(funderBalance)} ETH`,
    )
  }

  // Get the current nonce from the network
  let currentNonce = await ethers.provider.getTransactionCount(funder.address)
  console.log(`Starting with nonce: ${currentNonce}`)

  // Fund wallets in batches
  const ethAmount = ethers.parseEther(ETH_PER_WALLET)
  let fundedCount = 0
  let fundedWallets = []

  console.log(`\nFunding wallets with ${ETH_PER_WALLET} ETH each...`)

  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    // Get the current batch
    const batch = wallets.slice(i, Math.min(i + BATCH_SIZE, wallets.length))
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(wallets.length / BATCH_SIZE)} (${batch.length} wallets)...`,
    )

    // Prepare transactions with explicit nonces
    const txPromises = batch.map((wallet, index) => {
      const nonce = currentNonce + index
      console.log(`Preparing tx for ${wallet.address} with nonce ${nonce}`)

      return funder.sendTransaction({
        to: wallet.address,
        value: ethAmount,
        nonce,
        gasLimit: 30000, // Explicit gas limit for simple transfers
      })
    })

    try {
      // Send all transactions in the batch
      console.log(`Sending ${batch.length} transactions...`)
      const txs = await Promise.all(txPromises)

      // Wait for all confirmations
      console.log("Waiting for confirmations...")
      const receipts = await Promise.all(txs.map((tx) => tx.wait()))

      // Update nonce and funded count
      currentNonce += batch.length
      fundedCount += batch.length
      fundedWallets = [...fundedWallets, ...batch.map((w) => w.address)]

      console.log(
        `Batch complete. ${fundedCount}/${wallets.length} wallets funded so far.`,
      )

      // Add a small delay between batches
      if (i + BATCH_SIZE < wallets.length) {
        console.log("Waiting 2 seconds before next batch...")
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    } catch (error) {
      console.error("Error in batch:", error.message)

      // If there's an error, switch to sequential mode for this batch
      console.log("Switching to sequential mode for this batch...")

      // Reset nonce
      currentNonce = await ethers.provider.getTransactionCount(funder.address)
      console.log(`Current nonce from network: ${currentNonce}`)

      // Process each wallet in the batch sequentially
      for (const wallet of batch) {
        try {
          // Skip already funded wallets
          if (fundedWallets.includes(wallet.address)) {
            console.log(`Wallet ${wallet.address} already funded, skipping.`)
            continue
          }

          console.log(
            `Sending ${ETH_PER_WALLET} ETH to ${wallet.address} with nonce ${currentNonce}...`,
          )

          const tx = await funder.sendTransaction({
            to: wallet.address,
            value: ethAmount,
            nonce: currentNonce,
            gasLimit: 30000,
          })

          console.log(`Transaction sent: ${tx.hash}`)
          await tx.wait()

          currentNonce++
          fundedCount++
          fundedWallets.push(wallet.address)

          console.log(
            `Success. ${fundedCount}/${wallets.length} wallets funded so far.`,
          )
        } catch (walletError) {
          console.error(
            `Error funding wallet ${wallet.address}:`,
            walletError.message,
          )

          // If it's a nonce error, recover the nonce
          if (walletError.message.includes("invalid nonce")) {
            currentNonce = await ethers.provider.getTransactionCount(
              funder.address,
            )
            console.log(`Recovered nonce: ${currentNonce}`)
          }
        }

        // Small delay between sequential transactions
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }

  console.log(
    `\nFunding complete. ${fundedCount}/${wallets.length} wallets funded with ${ETH_PER_WALLET} ETH each.`,
  )

  // Update wallet file with funding status
  const updatedWallets = wallets.map((wallet) => ({
    ...wallet,
    funded: fundedWallets.includes(wallet.address),
    fundedAmount: fundedWallets.includes(wallet.address) ? ETH_PER_WALLET : "0",
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
