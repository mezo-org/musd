import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

// Configuration
const BTC_PER_WALLET = "0.001"
const OUTPUT_DIR = path.join(__dirname, "..", "..", "scale-testing")
const WALLETS_FILE = path.join(OUTPUT_DIR, "wallets.json")
const MAX_RETRIES = 5
const BATCH_SIZE = 100
const DELAY_BETWEEN_BATCHES = 5000

async function main() {
  if (!fs.existsSync(WALLETS_FILE)) {
    throw new Error(`Wallets file not found at ${WALLETS_FILE}.`)
  }

  const wallets: { address: string }[] = JSON.parse(
    fs.readFileSync(WALLETS_FILE, "utf8"),
  )
  console.log(`Loaded ${wallets.length} wallet addresses`)

  const [funder] = await ethers.getSigners()
  console.log(`Using funder account: ${funder.address}`)

  const funderBalance = await ethers.provider.getBalance(funder.address)
  const requiredBalance =
    ethers.parseEther(BTC_PER_WALLET) * BigInt(wallets.length)

  if (funderBalance < requiredBalance) {
    console.warn(
      "Warning: Insufficient funds to fund all wallets. Proceeding with available balance.",
    )
  }

  async function sendWithRetry(
    walletAddress: string,
    retryCount = 0,
  ): Promise<boolean> {
    if (retryCount >= MAX_RETRIES) {
      console.log(`Max retries reached for wallet ${walletAddress}, skipping.`)
      return false
    }

    try {
      const tx = await funder.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(BTC_PER_WALLET),
        gasLimit: 30000,
      })

      console.log(`Transaction sent: ${tx.hash}`)
      const receipt = await tx.wait(2) // Wait for 2 confirmations
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`)
      return true
    } catch (error: any) {
      console.error(
        `Error funding wallet ${walletAddress} (attempt ${retryCount + 1}):`,
        error.message,
      )
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return sendWithRetry(walletAddress, retryCount + 1)
    }
  }

  let fundedCount = 0
  const fundedWallets: string[] = []
  const failedWallets: { address: string; reason: string }[] = []

  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE)
    console.log(`Processing batch ${i / BATCH_SIZE + 1}...`)

    for (const wallet of batch) {
      const balance = await ethers.provider.getBalance(wallet.address)
      if (balance >= ethers.parseEther(BTC_PER_WALLET)) {
        console.log(`Wallet ${wallet.address} already funded, skipping.`)
        fundedCount++
        fundedWallets.push(wallet.address)
        continue
      }

      const success = await sendWithRetry(wallet.address)
      if (success) {
        fundedCount++
        fundedWallets.push(wallet.address)
      } else {
        failedWallets.push({
          address: wallet.address,
          reason: "Max retries reached or transaction failed.",
        })
      }
    }

    console.log(`Batch ${i / BATCH_SIZE + 1} complete.`)
    if (i + BATCH_SIZE < wallets.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
    }
  }

  console.log(
    `Funding complete. ${fundedCount}/${wallets.length} wallets funded.`,
  )

  if (failedWallets.length > 0) {
    console.log(
      `\nFailed to fund ${failedWallets.length} wallets. Details:`,
      failedWallets,
    )
  }

  fs.writeFileSync(
    WALLETS_FILE,
    JSON.stringify(
      wallets.map((wallet) => ({
        ...wallet,
        funded: fundedWallets.includes(wallet.address),
      })),
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error("Error in main function:", error)
  process.exit(1)
})
