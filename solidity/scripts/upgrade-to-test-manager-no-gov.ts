import { ethers, upgrades } from "hardhat"

async function main() {
  console.log("Starting upgrade to TestInterestRateManagerNoGov...")

  // Get the current implementation address from the network
  const proxyAddress = "0x25D5267a70Ee9a4801BcBDBABe513034926a8559" // Your proxy address
  console.log(`InterestRateManager proxy address: ${proxyAddress}`)

  // Deploy the new implementation
  const TestManager = await ethers.getContractFactory(
    "TestInterestRateManagerNoGov",
  )
  console.log("Deploying new implementation without governance check...")

  // Perform the upgrade
  const upgraded = await upgrades.upgradeProxy(proxyAddress, TestManager)

  // Wait for the transaction to be mined
  const tx = upgraded.deployTransaction
  if (tx) {
    await tx.wait()
    console.log(`Upgrade transaction: ${tx.hash}`)
  }

  console.log(
    `Upgraded to TestInterestRateManagerNoGov at same proxy address: ${proxyAddress}`,
  )
  console.log(
    "You can now use setInterestRateForTesting() function without governance permissions",
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error upgrading contract:", error)
    process.exit(1)
  })
