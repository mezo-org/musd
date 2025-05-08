import { ethers } from "hardhat"
import getDeploymentAddress from "../deployment-helpers"

async function getNewContracts() {
  // Get contract addresses
  const borrowerOperationsAddress = await getDeploymentAddress(
    "NewBorrowerOperations",
  )
  const priceFeedAddress = await getDeploymentAddress("PriceFeed")
  const troveManagerAddress = await getDeploymentAddress("NewTroveManager")
  const hintHelpersAddress = await getDeploymentAddress("NewHintHelpers")
  const sortedTrovesAddress = await getDeploymentAddress("NewSortedTroves")
  const musdAddress = await getDeploymentAddress("MUSD") // MUSD remains the same
  const mockAggregatorAddress = await getDeploymentAddress("MockAggregator") // MockAggregator remains the same

  console.log(`Using NewBorrowerOperations at: ${borrowerOperationsAddress}`)
  console.log(`Using NewPriceFeed at: ${priceFeedAddress}`)
  console.log(`Using NewTroveManager at: ${troveManagerAddress}`)
  console.log(`Using NewHintHelpers at: ${hintHelpersAddress}`)
  console.log(`Using NewSortedTroves at: ${sortedTrovesAddress}`)
  console.log(`Using MUSD at: ${musdAddress}`)
  console.log(`Using MockAggregator at: ${mockAggregatorAddress}`)

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
  const musdToken = await ethers.getContractAt("MUSD", musdAddress)
  const mockAggregator = await ethers.getContractAt(
    "MockAggregator",
    mockAggregatorAddress,
  )

  return {
    borrowerOperationsAddress,
    priceFeedAddress,
    troveManagerAddress,
    hintHelpersAddress,
    sortedTrovesAddress,
    musdAddress,
    borrowerOperations,
    priceFeed,
    troveManager,
    hintHelpers,
    sortedTroves,
    musdToken,
    mockAggregator,
  }
}

export default getNewContracts
