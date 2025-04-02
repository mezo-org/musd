// scripts/scale-testing/set-oracle.ts
import { ethers } from "hardhat"

async function main() {
  // Step 1: Get the PriceFeed contract
  const priceFeedAddress = "0xf28B0d5165b4ad9D5C04CdE1E37B400f8ca5A8cb"
  console.log(`Getting PriceFeed contract at: ${priceFeedAddress}`)
  const priceFeed = await ethers.getContractAt("PriceFeed", priceFeedAddress)

  // MockAggregator address
  const mockAggregatorAddress = "0xbD5Ac7174fA12378BE28B09bE96be95f0DDdb961"
  console.log(`MockAggregator address: ${mockAggregatorAddress}`)

  // Step 2: Call setOracle on PriceFeed
  console.log("Calling setOracle on PriceFeed...")
  const tx = await priceFeed.setOracle(mockAggregatorAddress)
  await tx.wait()
  console.log(`Transaction confirmed: ${tx.hash}`)

  // Step 3: Call fetchPrice to verify
  console.log("Calling fetchPrice to verify...")
  const price = await priceFeed.fetchPrice()
  console.log(`Current price from PriceFeed: ${ethers.formatEther(price)}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error)
    process.exit(1)
  })
