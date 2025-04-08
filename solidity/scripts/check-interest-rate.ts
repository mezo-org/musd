import { ethers } from "hardhat"
import { getDeploymentAddress } from "./deployment-helpers"

async function main() {
  const interestRateManagerAddress = await getDeploymentAddress(
    "InterestRateManager",
  )
  console.log(`InterestRateManager at: ${interestRateManagerAddress}`)

  // Try to access the contract as the upgraded version
  try {
    const interestRateManager = await ethers.getContractAt(
      "TestInterestRateManager",
      interestRateManagerAddress,
    )

    // Check if setInterestRateForTesting function exists by calling it with current rate
    const currentRate = await interestRateManager.interestRate()
    console.log(`Current interest rate: ${currentRate / 100}%`)

    // Try to access the test mode flag
    try {
      const isTestMode = await interestRateManager.isTestMode()
      console.log(`Test mode enabled: ${isTestMode}`)
      console.log("✅ Contract is upgraded to TestInterestRateManager")
    } catch (error) {
      console.log(
        "❌ isTestMode property not available - upgrade may not be complete",
      )
    }
  } catch (error) {
    console.error(
      "❌ Failed to interact with TestInterestRateManager. Contract may not be upgraded.",
    )
    console.error(error)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
