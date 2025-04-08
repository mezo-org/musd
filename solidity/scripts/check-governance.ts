import { ethers } from "hardhat"
import { getDeploymentAddress } from "./deployment-helpers"

async function main() {
  // Get contract addresses from deployments
  const interestRateManagerAddress = await getDeploymentAddress(
    "InterestRateManager",
  )
  const pcvAddress = await getDeploymentAddress("PCV")

  console.log(`InterestRateManager at: ${interestRateManagerAddress}`)
  console.log(`PCV at: ${pcvAddress}`)

  // Get PCV contract
  const pcv = await ethers.getContractAt("IPCV", pcvAddress)

  // Get governance address
  const governanceAddress = await pcv.council()
  console.log(`Governance address: ${governanceAddress}`)

  // Get current signer
  const [signer] = await ethers.getSigners()
  console.log(`Current signer: ${signer.address}`)

  if (governanceAddress.toLowerCase() === signer.address.toLowerCase()) {
    console.log("✅ Current signer HAS governance permissions")
  } else {
    console.log("❌ Current signer does NOT have governance permissions")
  }

  // Get the current interest rate
  const interestRateManager = await ethers.getContractAt(
    "InterestRateManager",
    interestRateManagerAddress,
  )
  const currentRate = await interestRateManager.interestRate()
  console.log(`Current interest rate: ${Number(currentRate) / 100}%`)

  // Check if we can detect the test function
  try {
    const testManager = await ethers.getContractAt(
      "TestInterestRateManager",
      interestRateManagerAddress,
    )

    // Try to access test mode flag
    const testMode = await testManager.isTestMode()
    console.log(`Test mode: ${testMode}`)
    console.log("✅ Contract is upgraded to TestInterestRateManager")
  } catch (error) {
    console.log(
      "❌ Contract does not appear to be upgraded to TestInterestRateManager",
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script error:", error)
    process.exit(1)
  })
