import { ethers } from "hardhat"
import {
  BorrowerOperations,
  HintHelpers,
  SortedTroves,
  TroveManager,
} from "../../typechain"

/**
 * Calculate hints for trove operations
 */
async function calculateTroveOperationHints(params: {
  borrowerOperations: BorrowerOperations
  hintHelpers: HintHelpers
  sortedTroves: SortedTroves
  troveManager: TroveManager
  collateralAmount: bigint
  debtAmount: bigint
  operation: "open" | "adjust"
  isCollIncrease?: boolean
  isDebtIncrease?: boolean
  currentCollateral?: bigint
  currentDebt?: bigint
  verbose?: boolean
}) {
  const {
    borrowerOperations,
    hintHelpers,
    sortedTroves,
    troveManager,
    collateralAmount,
    debtAmount,
    operation,
    isCollIncrease = true,
    isDebtIncrease = true,
    currentCollateral = 0n,
    currentDebt = 0n,
    verbose = false,
  } = params

  let nicr: bigint

  try {
    if (operation === "open") {
      // Calculate expected total debt for an open operation
      const gasCompensation = await troveManager.MUSD_GAS_COMPENSATION()
      const borrowingFee = await borrowerOperations.getBorrowingFee(debtAmount)

      const totalDebt = debtAmount + borrowingFee + gasCompensation

      if (verbose) {
        console.log("Hint calculation for Open Trove:")
        console.log(`- Collateral: ${ethers.formatEther(collateralAmount)} BTC`)
        console.log(`- Requested debt: ${ethers.formatEther(debtAmount)} MUSD`)
        console.log(`- Borrowing fee: ${ethers.formatEther(borrowingFee)} MUSD`)
        console.log(
          `- Gas compensation: ${ethers.formatEther(gasCompensation)} MUSD`,
        )
        console.log(`- Total debt: ${ethers.formatEther(totalDebt)} MUSD`)
      }

      // Calculate NICR for a new trove
      nicr = (collateralAmount * 10n ** 20n) / totalDebt
    } else {
      // For adjustTrove, calculate the final collateral and debt
      let finalCollateral = currentCollateral
      let finalDebt = currentDebt

      // Apply changes based on whether we're increasing or decreasing
      if (isCollIncrease) {
        finalCollateral += collateralAmount
      } else {
        finalCollateral -= collateralAmount
      }

      if (isDebtIncrease) {
        // For debt increase, need to account for borrowing fee
        const borrowingFee = isDebtIncrease
          ? await borrowerOperations.getBorrowingFee(debtAmount)
          : 0n
        finalDebt += debtAmount + borrowingFee
      } else {
        finalDebt -= debtAmount
      }

      if (verbose) {
        console.log("Hint calculation for Adjust Trove:")
        console.log(
          `- Current collateral: ${ethers.formatEther(currentCollateral)} BTC`,
        )
        console.log(`- Current debt: ${ethers.formatEther(currentDebt)} MUSD`)
        console.log(
          `- Collateral ${isCollIncrease ? "increase" : "decrease"}: ${ethers.formatEther(collateralAmount)} BTC`,
        )
        console.log(
          `- Debt ${isDebtIncrease ? "increase" : "decrease"}: ${ethers.formatEther(debtAmount)} MUSD`,
        )
        console.log(
          `- Final collateral: ${ethers.formatEther(finalCollateral)} BTC`,
        )
        console.log(`- Final debt: ${ethers.formatEther(finalDebt)} MUSD`)
      }

      // Calculate NICR for the adjusted trove
      nicr = (finalCollateral * 10n ** 20n) / finalDebt
    }

    if (verbose) {
      console.log(`- Calculated NICR: ${nicr}`)
    }

    // Get number of trials based on the number of troves
    const numTroves = await sortedTroves.getSize()
    // Use at least 15 trials, more for larger systems
    const numTrials = BigInt(
      Math.min(Math.ceil(Math.sqrt(Number(numTroves)) * 15), 999),
    )
    const randomSeed = Math.ceil(Math.random() * 10000000) // Random seed for better distribution

    if (verbose) {
      console.log(`- Total troves: ${numTroves}`)
      console.log(`- Using ${numTrials} trials for hint approximation`)
    }

    // Get approximate hint
    const { 0: approxHint } = await hintHelpers.getApproxHint(
      nicr,
      numTrials,
      randomSeed,
    )

    if (verbose) {
      console.log(`- Approximate hint address: ${approxHint}`)
    }

    // Get exact insert position using the approximate hint
    const { 0: upperHint, 1: lowerHint } =
      await sortedTroves.findInsertPosition(nicr, approxHint, approxHint)

    if (verbose) {
      console.log(`- Upper hint: ${upperHint}`)
      console.log(`- Lower hint: ${lowerHint}`)
    }

    return {
      upperHint,
      lowerHint,
      nicr,
      success: true,
    }
  } catch (error) {
    console.error(`Error calculating hints: ${error}`)
    return {
      upperHint: ethers.ZeroAddress,
      lowerHint: ethers.ZeroAddress,
      nicr: 0n,
      success: false,
      error,
    }
  }
}

export default calculateTroveOperationHints
