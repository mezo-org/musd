// scripts/set-test-interest-rate.ts
import { ethers } from "hardhat"
import { getDeploymentAddress } from "./deployment-helpers"

async function main() {
  // Get arguments
  const args = process.argv.slice(2)
  const interestRateArg = args[0]

  if (!interestRateArg) {
    console.error(
      "Please provide an interest rate (in basis points, e.g. 400 for 4%)",
    )
    process.exit(1)
  }

  const interestRateBasis = parseInt(interestRateArg)
  console.log(`Setting interest rate to: ${interestRateBasis / 100}%`)

  // Get contract
  const interestRateManagerAddress = await getDeploymentAddress(
    "InterestRateManager",
  )
  const interestRateManager = await ethers.getContractAt(
    "ZeroDelayInterestRateManager",
    interestRateManagerAddress,
  )

  // Get governance address (council)
  const pcvAddress = await interestRateManager.pcv()
  const pcv = await ethers.getContractAt("IPCV", pcvAddress)
  const councilAddress = await pcv.council()

  // Get council signer
  const [deployer] = await ethers.getSigners()
  console.log(`Using deployer address: ${deployer.address}`)

  // Create interest rate proposal
  const tx1 = await interestRateManager
    .connect(deployer)
    .proposeInterestRate(interestRateBasis)
  await tx1.wait()
  console.log(`Proposed interest rate: ${interestRateBasis / 100}%`)

  // Approve immediately (since MIN_DELAY is 0)
  const tx2 = await interestRateManager.connect(deployer).approveInterestRate()
  await tx2.wait()

  // Verify new rate
  const newRate = await interestRateManager.interestRate()
  console.log(`New interest rate set: ${newRate / 100}%`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting interest rate:", error)
    process.exit(1)
  })
