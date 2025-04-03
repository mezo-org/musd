// scripts/scale-testing/update-trove-states.ts
import { ethers } from "hardhat"
import { StateManager } from "./state-manager"
import { getDeploymentAddress } from "../deployment-helpers"

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Updating Trove states for network: ${networkName}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Get contract addresses
  const troveManagerAddress = await getDeploymentAddress("TroveManager")
  const musdAddress = await getDeploymentAddress("MUSD")

  console.log(`Using TroveManager at: ${troveManagerAddress}`)
  console.log(`Using MUSD at: ${musdAddress}`)

  // Update Trove states
  const updatedTroves =
    await stateManager.updateTroveStates(troveManagerAddress)
  console.log(`Updated Trove states for ${updatedTroves} accounts`)

  // Update MUSD balances
  const updatedMusd = await stateManager.updateMusdBalances(musdAddress)
  console.log(`Updated MUSD balances for ${updatedMusd} accounts`)

  // Update BTC balances
  const updatedBalances = await stateManager.updateBtcBalances()
  console.log(`Updated BTC balances for ${updatedBalances} accounts`)

  console.log("Trove state update complete!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error updating Trove states:", error)
    process.exit(1)
  })
