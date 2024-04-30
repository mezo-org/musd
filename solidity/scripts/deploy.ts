import { ethers } from "hardhat"

async function main() {
  const dummy = await ethers.deployContract("Dummy")
  await dummy.waitForDeployment()

  // console.log("Deployed Dummy contract}")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(() => {
  // console.error(_error)
  process.exitCode = 1
})
