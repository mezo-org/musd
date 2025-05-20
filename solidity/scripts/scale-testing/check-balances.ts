// File: scripts/scale-testing/check-balances-fast.ts
import { ethers } from "ethers"
import * as fs from "fs"
import * as path from "path"

const RPC_URL = "https://rpc.test.mezo.org"
const WALLETS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "scale-testing",
  "wallets.json",
)
const CONCURRENCY = 20 // Increase if your node can handle more

async function main() {
  const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"))
  const provider = new ethers.JsonRpcProvider(RPC_URL)

  let fundedCount = 0
  let checkedCount = 0

  // Helper to run N promises in parallel
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

  await mapLimit(wallets, CONCURRENCY, async (wallet, i) => {
    try {
      const balance = await provider.getBalance(wallet.address)
      checkedCount++
      if (balance > 0n) fundedCount++
      if (checkedCount % 1000 === 0) {
        console.log(`Checked ${checkedCount} wallets...`)
      }
    } catch (e) {
      console.error(`Error checking ${wallet.address}:`, e)
    }
  })

  console.log(`\nChecked ${checkedCount} wallets.`)
  console.log(`Funded wallets (balance > 0): ${fundedCount}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
