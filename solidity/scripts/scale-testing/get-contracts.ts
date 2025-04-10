import { ethers } from "hardhat"
import { getDeploymentAddress } from "../deployment-helpers.ts"

export async function getContracts() {
  // Get contract addresses
  const borrowerOperationsAddress =
    await getDeploymentAddress("BorrowerOperations")
  const priceFeedAddress = await getDeploymentAddress("PriceFeed")
  const troveManagerAddress = await getDeploymentAddress("TroveManager")
  const hintHelpersAddress = await getDeploymentAddress("HintHelpers")
  const sortedTrovesAddress = await getDeploymentAddress("SortedTroves")

  console.log(`Using BorrowerOperations at: ${borrowerOperationsAddress}`)
  console.log(`Using PriceFeed at: ${priceFeedAddress}`)
  console.log(`Using TroveManager at: ${troveManagerAddress}`)
  console.log(`Using HintHelpers at: ${hintHelpersAddress}`)
  console.log(`Using SortedTroves at: ${sortedTrovesAddress}`)

  // Get contract instances
  const borrowerOperations = await ethers.getContractAt(
    "BorrowerOperations",
    borrowerOperationsAddress,
  )
  const priceFeed = await ethers.getContractAt("PriceFeed", priceFeedAddress)
  const troveManager = await ethers.getContractAt(
    "TroveManager",
    troveManagerAddress,
  )
  const hintHelpers = await ethers.getContractAt(
    "HintHelpers",
    hintHelpersAddress,
  )
  const sortedTroves = await ethers.getContractAt(
    "SortedTroves",
    sortedTrovesAddress,
  )

  return {
    borrowerOperationsAddress,
    priceFeedAddress,
    troveManagerAddress,
    hintHelpersAddress,
    sortedTrovesAddress,
    borrowerOperations,
    priceFeed,
    troveManager,
    hintHelpers,
    sortedTroves,
  }
}
