// scripts/scale-testing/init-state-tracking.ts
import { ethers } from "hardhat"
import * as path from "path"
import StateManager from "./state-manager"

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Initializing state tracking for network: ${networkName}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Path to wallet file
  const walletFilePath = path.join(
    __dirname,
    "..",
    "..",
    "scale-testing",
    "wallets.json",
  )

  // Initialize from wallet file
  const newAccounts = stateManager.initializeFromWalletFile(walletFilePath)
  console.log(`Added ${newAccounts} new accounts to state tracking`)

  // Update BTC balances
  const updatedBalances = await stateManager.updateBtcBalances()
  console.log(`Updated BTC balances for ${updatedBalances} accounts`)

  console.log("State tracking initialization complete!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error initializing state tracking:", error)
    process.exit(1)
  })
