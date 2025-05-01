import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

// Configuration
const BTC_PER_WALLET = "0.001"
const OUTPUT_DIR = path.join(__dirname, "..", "..", "scale-testing")
const WALLETS_FILE = path.join(OUTPUT_DIR, "wallets.json")
const BATCH_SIZE = 50

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

  let fundedCount = 0
  const fundedWallets: string[] = []
  const unfundedWallets: string[] = []

  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE)
    console.log(`Checking batch ${i / BATCH_SIZE + 1}...`)

    for (const wallet of batch) {
      const balance = await ethers.provider.getBalance(wallet.address)
      if (balance >= ethers.parseEther(BTC_PER_WALLET)) {
        console.log(`Wallet ${wallet.address} is funded with ${ethers.formatEther(balance)} ETH`)
        fundedCount++
        fundedWallets.push(wallet.address)
      } else {
        console.log(`Wallet ${wallet.address} is not funded (balance: ${ethers.formatEther(balance)} ETH)`)
        unfundedWallets.push(wallet.address)
      }
    }
  }

  console.log(`\nVerification complete.`)
  console.log(`Funded wallets: ${fundedCount}/${wallets.length}`)
  console.log(`Unfunded wallets: ${unfundedWallets.length}/${wallets.length}`)

  // Update wallets.json with current funding status
  const updatedWallets = wallets.map(async (wallet) => ({
    ...wallet,
    funded: fundedWallets.includes(wallet.address),
    balance: ethers.formatEther(await ethers.provider.getBalance(wallet.address)),
  }))

  const resolvedWallets = await Promise.all(updatedWallets)
  fs.writeFileSync(
    WALLETS_FILE,
    JSON.stringify(resolvedWallets, null, 2),
  )

  console.log(`\nUpdated wallets.json with current funding status.`)
}

main().catch((error) => {
  console.error("Error in main function:", error)
  process.exit(1)
})
