import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

const BTC_PER_WALLET = "0.001"
const WALLETS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "scale-testing",
  "wallets.json",
)
const CONCURRENCY = 10 // Adjust as needed
const SAVE_INTERVAL = 1000 // Save after every 1000 funded wallets

async function main() {
  const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"))
  const [funder] = await ethers.getSigners()
  const { provider } = funder

  const unfunded = wallets.filter((w: any) => !w.funded)
  console.log(`Unfunded wallets: ${unfunded.length}`)

  let fundedCount = 0

  async function mapLimit<T, R>(
    arr: T[],
    limit: number,
    fn: (item: T, idx: number) => Promise<R>,
  ): Promise<R[]> {
    let idx = 0
    const results: R[] = []
    const executing: Promise<void>[] = []
    async function run(i: number) {
      results[i] = await fn(arr[i], i)
    }
    while (idx < arr.length) {
      const p = run(idx++)
      executing.push(p.then(() => executing.splice(executing.indexOf(p), 1)))
      if (executing.length >= limit) await Promise.race(executing)
    }
    await Promise.all(executing)
    return results
  }

  await mapLimit(unfunded, CONCURRENCY, async (wallet, i) => {
    try {
      const balance = await provider.getBalance(wallet.address)
      if (balance > 0n) {
        wallet.funded = true
        return
      }
      const tx = await funder.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther(BTC_PER_WALLET),
        gasLimit: 30000,
      })
      await tx.wait(1)
      fundedCount++
      wallet.funded = true
      if (fundedCount % SAVE_INTERVAL === 0) {
        fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2))
        console.log(`Progress saved after funding ${fundedCount} wallets.`)
      }
    } catch (e) {
      console.error(`Error funding ${wallet.address}:`, e)
    }
  })

  // Final save
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2))
  console.log(`Funding complete. Funded ${fundedCount} wallets.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
