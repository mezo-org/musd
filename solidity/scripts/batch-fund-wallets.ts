import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

const BATCH_FUNDER_ADDRESS = "0x2aFF1e6a325464aA0e46eD5D2793b40485aC6273" // <-- Replace after deployment
const WALLETS_FILE = path.join(__dirname, "..", "scale-testing", "wallets.json")
const AMOUNT_PER_WALLET = ethers.parseEther("0.001")
const BATCH_SIZE = 200 // Adjust based on gas limit

async function main() {
  const [sender] = await ethers.getSigners()
  const batchFunder = await ethers.getContractAt(
    "BatchFunder",
    BATCH_FUNDER_ADDRESS,
  )
  const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"))

  // Only fund wallets that are not funded
  const unfunded = wallets.filter((w: any) => !w.funded)
  console.log(`Unfunded wallets: ${unfunded.length}`)

  for (let i = 0; i < unfunded.length; i += BATCH_SIZE) {
    const batch = unfunded.slice(i, i + BATCH_SIZE)
    const addresses = batch.map((w: any) => w.address)
    const totalValue = AMOUNT_PER_WALLET * BigInt(addresses.length)
    console.log(
      `Funding batch ${i / BATCH_SIZE + 1}: ${addresses.length} wallets`,
    )

    const tx = await batchFunder.batchSendETH(addresses, AMOUNT_PER_WALLET, {
      value: totalValue,
    })
    await tx.wait(1)
    console.log(`Batch ${i / BATCH_SIZE + 1} funded!`)

    // Optionally, update funded status in memory
    for (const w of batch) w.funded = true

    // Save progress after each batch
    fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2))
  }

  console.log("All batches funded!")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
