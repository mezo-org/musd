import { ethers } from "hardhat"
import { getDeploymentAddress } from "./deployment-helpers"

async function main() {
  // Get the interest rate we want to set (e.g., 400 basis points = 4%)
  const interestRateArg = "400"
  const interestRateBasis = parseInt(interestRateArg, 10)

  console.log(`Setting test interest rate to: ${interestRateBasis / 100}%`)

  // Get contract address
  const interestRateManagerAddress = await getDeploymentAddress(
    "InterestRateManager",
  )
  console.log(`InterestRateManager at: ${interestRateManagerAddress}`)

  // Get current interest rate
  const contract = await ethers.getContractAt(
    "InterestRateManagerTester",
    interestRateManagerAddress,
  )
  const currentRate = await contract.interestRate()
  console.log(`Current interest rate: ${Number(currentRate) / 100}%`)

  // Try to set the new rate
  try {
    console.log(`Setting interest rate to ${interestRateBasis / 100}%...`)
    const tx = await contract.setInterestRateForTesting(interestRateBasis)
    console.log(`Transaction sent: ${tx.hash}`)
    console.log("Waiting for confirmation...")
    await tx.wait()

    // Verify new rate
    const newRate = await contract.interestRate()
    console.log(`New interest rate set: ${Number(newRate) / 100}%`)

    if (Number(newRate) === interestRateBasis) {
      console.log("✅ Success! The upgrade worked correctly.")
    } else {
      console.log("❌ Failed! Rate was set but doesn't match expected value.")
    }
  } catch (error) {
    console.error("❌ Error setting interest rate:")
    console.error(error)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script error:", error)
    process.exit(1)
  })
