import { ethers } from "hardhat"
import calculateTroveOperationHints from "./hint-helper"
import getContracts from "./get-contracts"

async function main() {
  // Get contracts

  const { borrowerOperations, hintHelpers, sortedTroves, troveManager } =
    await getContracts()

  // Test parameters
  const params = {
    borrowerOperations,
    hintHelpers,
    sortedTroves,
    troveManager,
    collateralAmount: ethers.parseEther("1"), // 1 BTC
    debtAmount: ethers.parseEther("1000"), // 1000 MUSD
    operation: "open" as const,
    verbose: true,
  }

  console.log("Starting hint calculation test...")
  const result = await calculateTroveOperationHints(params)

  console.log("\nFinal result:")
  console.log(`- Success: ${result.success}`)
  if (result.success) {
    console.log(`- Upper hint: ${result.upperHint}`)
    console.log(`- Lower hint: ${result.lowerHint}`)
    console.log(`- NICR: ${result.nicr}`)
  } else {
    console.log(`- Error: ${result.error}`)
  }
}

main().catch((error) => {
  console.error("Error in main function:", error)
  process.exit(1)
})
