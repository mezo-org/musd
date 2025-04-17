// scripts/scale-testing/scenarios/liquidate-troves.ts
import { ethers } from "hardhat"
import fs from "fs"
import path from "path"
import StateManager from "../state-manager"
import getDeploymentAddress from "../../deployment-helpers"

// Configuration
const TEST_ID = "liquidate-troves-test"
const NUM_ACCOUNTS = 5 // Number of troves to liquidate
const TARGET_CR_RANGE = {
  min: 115, // Minimum CR to consider (%)
  max: 250, // Maximum CR to consider (%) - Increased to find more candidates
}
const MCR = 110 // Minimum Collateralization Ratio (%)

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Liquidate Troves test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Get contract addresses
  const troveManagerAddress = await getDeploymentAddress("TroveManager")
  const mockAggregatorAddress = await getDeploymentAddress("MockAggregator")

  console.log(`Using TroveManager at: ${troveManagerAddress}`)
  console.log(`Using MockAggregator at: ${mockAggregatorAddress}`)

  // Get contract instances
  const troveManager = await ethers.getContractAt(
    "TroveManager",
    troveManagerAddress,
  )
  const mockAggregator = await ethers.getContractAt(
    "MockAggregator",
    mockAggregatorAddress,
  )

  // Get the deployer account (which should have price feed admin rights)
  const [deployer] = await ethers.getSigners()
  console.log(`Using deployer account: ${deployer.address}`)

  // Update trove states before selecting accounts
  console.log("Updating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)
  console.log("Trove states updated")

  // Get the current BTC price from the MockAggregator
  const [, currentPriceInt, , ,] = await mockAggregator.latestRoundData()
  const originalPrice = BigInt(currentPriceInt.toString())

  // Get the decimals from the aggregator
  const decimals = await mockAggregator.decimals()

  console.log(
    `Current BTC price: ${ethers.formatUnits(originalPrice, decimals)} USD (raw: ${originalPrice}, decimals: ${decimals})`,
  )

  // Select accounts for testing - accounts that HAVE troves
  // We'll select more than we need to find ones with suitable CRs
  const allTroveAccounts = stateManager.getAccounts({
    hasTrove: true,
    notUsedInTest: TEST_ID,
    limit: 100, // Get a large sample to find suitable troves
  })

  console.log(
    `Found ${allTroveAccounts.length} accounts with troves to analyze`,
  )

  if (allTroveAccounts.length === 0) {
    console.error("No accounts with troves found.")
    process.exit(1)
  }

  // Step 1: Find troves with low-ish CRs
  console.log(
    "\nStep 1: Finding troves with CR between " +
      `${TARGET_CR_RANGE.min}% and ${TARGET_CR_RANGE.max}%...`,
  )

  const trovesWithCR = []

  for (const account of allTroveAccounts) {
    try {
      const troveState = await troveManager.Troves(account.address)
      const { coll } = troveState
      const debt = troveState.principal + troveState.interestOwed

      if (debt <= BigInt(0)) {
        continue // Skip troves with no debt
      }

      // Calculate current CR: (coll * price) / debt
      // Note: We need to adjust for the different decimal places
      // Trove collateral is in 18 decimals, price is in `decimals` decimals

      // First, adjust the price to 18 decimals if needed
      const adjustedPrice =
        decimals === 18n
          ? originalPrice
          : originalPrice * BigInt(10) ** (18n - BigInt(decimals))

      const cr = await troveManager.getCurrentICR(
        account.address,
        adjustedPrice,
      )

      // Convert to percentage (as a BigInt)
      const crPercentageBigInt = (cr * 100n) / BigInt(10) ** 18n
      const crPercentage = Number(crPercentageBigInt)

      if (
        crPercentage >= TARGET_CR_RANGE.min &&
        crPercentage <= TARGET_CR_RANGE.max
      ) {
        console.log(`Account ${account.address} - CR: ${crPercentage}%`)
        trovesWithCR.push({
          address: account.address,
          collateral: coll,
          debt,
          cr,
          crPercentage,
        })
      }
    } catch (error) {
      console.log(`Error checking CR for ${account.address}: ${error.message}`)
    }
  }

  // Sort troves by CR (ascending)
  trovesWithCR.sort((a, b) => a.crPercentage - b.crPercentage)

  console.log(`Found ${trovesWithCR.length} troves with CR in the target range`)

  if (trovesWithCR.length === 0) {
    console.error(
      "No troves found with CR in the target range. Try adjusting the TARGET_CR_RANGE.",
    )
    process.exit(1)
  }

  // Select the troves to liquidate (up to NUM_ACCOUNTS)
  const trovesToLiquidate = trovesWithCR.slice(0, NUM_ACCOUNTS)

  console.log(`Selected ${trovesToLiquidate.length} troves for liquidation`)

  // Step 2: Calculate how far to drop the price
  console.log("\nStep 2: Calculating required price drop...")

  // Find the highest CR among the troves to liquidate
  const highestCR = trovesToLiquidate[trovesToLiquidate.length - 1].crPercentage
  console.log(`Highest CR among selected troves: ${highestCR}%`)

  // Calculate price reduction factor
  // We need to drop the price so that highestCR becomes just below MCR
  // New CR = (coll * newPrice) / debt = MCR - small buffer

  const targetCR = MCR - 1 // Target CR just below MCR (e.g., 109%)
  const priceReductionFactor = 1 - targetCR / highestCR
  const priceReductionPercentage = priceReductionFactor * 100

  console.log(
    `Required price reduction: ${priceReductionPercentage.toFixed(2)}%`,
  )

  // Calculate the new price (as a uint256 with the correct decimals)
  const newPriceBigInt =
    (originalPrice * BigInt(Math.floor((1 - priceReductionFactor) * 1000))) /
    BigInt(1000)
  console.log(
    `New price: ${ethers.formatUnits(newPriceBigInt, decimals)} USD (raw: ${newPriceBigInt})`,
  )

  // Load wallet for the deployer (for price changes)
  const deployerWallet = await ethers.provider.getSigner(deployer.address)

  // Initialize results object
  const results = {
    successful: 0,
    failed: 0,
    gasUsed: BigInt(0),
    transactions: [],
  }

  try {
    // Step 3: Set the new price via MockAggregator
    console.log("\nStep 3: Setting new price via MockAggregator...")

    // Use the setPrice function from the MockAggregator contract
    const setPriceTx = await mockAggregator
      .connect(deployerWallet)
      .setPrice(newPriceBigInt)

    console.log(`Price change transaction sent: ${setPriceTx.hash}`)
    await setPriceTx.wait()
    console.log(
      `Price successfully changed to ${ethers.formatUnits(newPriceBigInt, decimals)} USD`,
    )

    // Wait a moment for price to propagate
    console.log("Waiting 5 seconds for price change to propagate...")
    await new Promise((resolve) => {
      setTimeout(resolve, 5000)
    })

    // Step 4: Perform liquidations
    console.log("\nStep 4: Liquidating troves...")

    for (let i = 0; i < trovesToLiquidate.length; i++) {
      const trove = trovesToLiquidate[i]
      console.log(
        `\nLiquidating trove ${i + 1}/${trovesToLiquidate.length}: ${trove.address}`,
      )

      try {
        // Verify the trove is now liquidatable
        const troveState = await troveManager.Troves(trove.address)
        const { coll } = troveState
        const debt = troveState.principal + troveState.interestOwed

        // Calculate new CR at the reduced price
        // First, adjust the price to 18 decimals if needed
        const adjustedNewPrice =
          decimals === 18n
            ? newPriceBigInt
            : newPriceBigInt * BigInt(10) ** (18n - BigInt(decimals))

        // Calculate CR in 18 decimals
        const newCR = (coll * adjustedNewPrice) / debt

        // Convert to percentage (as a BigInt)
        const newCRPercentageBigInt = (newCR * 100n) / BigInt(10) ** 18n
        const newCRPercentage = Number(newCRPercentageBigInt)

        console.log(`Trove collateral: ${ethers.formatEther(coll)} BTC`)
        console.log(`Trove debt: ${ethers.formatEther(debt)} MUSD`)
        console.log(`New CR at reduced price: ${newCRPercentage}%`)

        if (newCRPercentage >= MCR) {
          console.log(
            `Trove is still above MCR (${MCR}%). Skipping liquidation.`,
          )
          continue
        }

        // Record the start time
        const startTime = Date.now()

        // Liquidate the trove
        const liquidateTx = await troveManager
          .connect(deployerWallet)
          .liquidate(trove.address, {
            gasLimit: 2000000, // Higher gas limit for complex operation
          })

        console.log(`Liquidation transaction sent: ${liquidateTx.hash}`)

        // Wait for transaction to be mined
        const receipt = await liquidateTx.wait()

        // Calculate metrics
        const endTime = Date.now()
        const duration = endTime - startTime
        const gasUsed = receipt ? receipt.gasUsed : BigInt(0)

        console.log(
          `Liquidation confirmed! Gas used: ${gasUsed}, Duration: ${duration}ms`,
        )

        // Update results
        results.successful++
        results.gasUsed += gasUsed
        results.transactions.push({
          hash: liquidateTx.hash,
          account: trove.address,
          collateralLiquidated: ethers.formatEther(coll),
          debtLiquidated: ethers.formatEther(debt),
          gasUsed: gasUsed.toString(),
          duration,
        })

        // Record the action in the state manager
        stateManager.recordAction(trove.address, "liquidated", TEST_ID)

        // Wait a bit between liquidations to avoid network congestion
        if (i < trovesToLiquidate.length - 1) {
          console.log("Waiting 2 seconds before next liquidation...")
          await new Promise((resolve) => {
            setTimeout(resolve, 2000)
          })
        }
      } catch (error) {
        console.log(`Error liquidating trove: ${error.message}`)
        results.failed++
        results.transactions.push({
          account: trove.address,
          error: error.message,
        })
      }
    }
  } finally {
    // Step 5: Restore the original price
    console.log("\nStep 5: Restoring original price...")
    try {
      const restorePriceTx = await mockAggregator
        .connect(deployerWallet)
        .setPrice(originalPrice)
      console.log(`Price restoration transaction sent: ${restorePriceTx.hash}`)
      await restorePriceTx.wait()
      console.log(
        `Price successfully restored to ${ethers.formatUnits(originalPrice, decimals)} USD`,
      )
    } catch (error) {
      console.error(`Error restoring price: ${error.message}`)
    }
  }

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total troves processed: ${trovesToLiquidate.length}`)
  console.log(`Successfully liquidated: ${results.successful}`)
  console.log(`Failed liquidations: ${results.failed}`)
  console.log(`Total gas used: ${results.gasUsed}`)
  console.log(
    `Average gas per liquidation: ${results.successful > 0 ? results.gasUsed / BigInt(results.successful) : BigInt(0)}`,
  )

  // Save results to file
  const resultsDir = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "scale-testing",
    "results",
  )

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true })
  }

  const resultsFile = path.join(
    resultsDir,
    `${TEST_ID}-${new Date().toISOString().replace(/:/g, "-")}.json`,
  )
  fs.writeFileSync(
    resultsFile,
    JSON.stringify(
      {
        testId: TEST_ID,
        timestamp: new Date().toISOString(),
        network: networkName,
        config: {
          numAccounts: NUM_ACCOUNTS,
          targetCRRange: TARGET_CR_RANGE,
          mcr: MCR,
          priceReductionPercentage: priceReductionPercentage.toFixed(2),
          originalPrice: ethers.formatUnits(originalPrice, decimals),
          reducedPrice: ethers.formatUnits(newPriceBigInt, decimals),
        },
        results: {
          successful: results.successful,
          failed: results.failed,
          gasUsed: results.gasUsed.toString(),
          averageGas:
            results.successful > 0
              ? (results.gasUsed / BigInt(results.successful)).toString()
              : "0",
        },
        transactions: results.transactions,
      },
      null,
      2,
    ),
  )

  console.log(`Results saved to ${resultsFile}`)

  // Update all Trove states again to ensure data is current
  console.log("\nUpdating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
