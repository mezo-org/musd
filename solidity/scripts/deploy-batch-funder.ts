import { ethers } from "hardhat"

async function main() {
  const BatchFunder = await ethers.getContractFactory("BatchFunder")
  const batchFunder = await BatchFunder.deploy()
  await batchFunder.waitForDeployment()
  console.log("BatchFunder deployed to:", await batchFunder.getAddress())
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
