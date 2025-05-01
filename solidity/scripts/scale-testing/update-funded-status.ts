// File: scripts/scale-testing/update-funded-status.ts
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
const CONCURRENCY = 20

async function main() {
  const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"))
  const provider = new ethers.JsonRpcProvider(RPC_URL)

  await Promise.all(
    wallets.map(async (wallet: any, i: number) => {
      try {
        const balance = await provider.getBalance(wallet.address)
        wallet.funded = balance > 0n
        if (i % 1000 === 0) console.log(`Checked ${i} wallets...`)
      } catch (e) {
        console.error(`Error checking ${wallet.address}:`, e)
      }
    }),
  )

  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2))
  console.log("Updated funded status for all wallets.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
