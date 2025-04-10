// scripts/scale-testing/scenarios/increase-debt.ts
import { ethers } from "hardhat"
import fs from "fs"
import path from "path"
import StateManager from "../state-manager"
import WalletHelper from "../wallet-helper"
import getDeploymentAddress from "../../deployment-helpers"
import getContracts from "../get-contracts"
import calculateTroveOperationHints from "../hint-helper"

// Configuration
const TEST_ID = "increase-debt-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use
const MUSD_AMOUNTS = ["100", "200", "300", "400", "500"] // MUSD amounts to borrow

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Increase Debt test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  const {
    troveManagerAddress,
    borrowerOperations,
    priceFeed,
    troveManager,
    hintHelpers,
    sortedTroves,
  } = await getContracts()

  // Get the current BTC price from the price feed
  let currentPrice
  try {
    currentPrice = await priceFeed.fetchPrice()
    console.log(`Current BTC price: $${ethers.formatEther(currentPrice)}`)
  } catch (error) {
    console.error(`Error getting price: ${error.message}`)
    process.exit(1)
  }

  // Update trove states before selecting accounts
  console.log("Updating Trove states for all accounts...")
  await stateManager.updateTroveStates(troveManagerAddress)
  console.log("Trove states updated")

  // Select accounts for testing - accounts that HAVE troves
  const testAccounts = stateManager.getAccounts({
    hasTrove: true,
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS,
  })

  console.log(
    `Selected ${testAccounts.length} accounts with existing troves for testing`,
  )

  // Load wallets for these accounts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Initialize results object
  const results = {
    successful: 0,
    failed: 0,
    gasUsed: 0n,
    transactions: [] as never[],
  }

  // Process each account
  for (let i = 0; i < testAccounts.length; i++) {
    const account = testAccounts[i]
    const musdAmount = ethers.parseEther(MUSD_AMOUNTS[i % MUSD_AMOUNTS.length])

    console.log(
      `\nProcessing account ${i + 1}/${testAccounts.length}: ${account.address}`,
    )
    console.log(`Borrowing additional ${ethers.formatEther(musdAmount)} MUSD`)

    // Get current trove state for reference
    let troveState
    try {
      troveState = await troveManager.Troves(account.address)
      const totalDebt = troveState.principal + troveState.interestOwed
      console.log(
        `Current trove collateral: ${ethers.formatEther(troveState.coll)} BTC`,
      )
      console.log(`Current trove debt: ${ethers.formatEther(totalDebt)} MUSD`)

      // Calculate current ICR
      const icr = (troveState.coll * currentPrice * 100n) / totalDebt
      console.log(`Current ICR: ${icr / 100n}.${icr % 100n}%`)

      // Calculate new ICR after borrowing
      const newTotalDebt = totalDebt + musdAmount
      const newIcr = (troveState.coll * currentPrice * 100n) / newTotalDebt
      console.log(
        `Projected ICR after borrowing: ${newIcr / 100n}.${newIcr % 100n}%`,
      )

      // Check if new ICR would be too low (below 110%)
      if (newIcr < 11000n) {
        console.log(
          "Warning: New ICR would be too low. Reducing borrow amount.",
        )
        // Calculate a safer amount to borrow (targeting 120% ICR)
        const saferDebt = (troveState.coll * currentPrice * 100n) / 12000n
        const saferBorrowAmount =
          saferDebt > totalDebt ? saferDebt - totalDebt : 0n

        if (saferBorrowAmount > 0n) {
          console.log(
            `Adjusted borrow amount to ${ethers.formatEther(saferBorrowAmount)} MUSD`,
          )
          musdAmount = saferBorrowAmount
        } else {
          console.log("Cannot safely borrow more. Skipping this account.")
          results.failed++
          results.transactions.push({
            account: account.address,
            musdAmount: ethers.formatEther(musdAmount),
            error: "ICR would be too low",
          })
          continue
        }
      }
    } catch (error) {
      console.log(`Could not fetch current trove state: ${error.message}`)
    }

    // Get the wallet
    const wallet = walletHelper.getWallet(account.address)

    if (!wallet) {
      console.log(`No wallet found for account ${account.address}, skipping`)
      results.failed++
      results.transactions.push({
        account: account.address,
        musdAmount: ethers.formatEther(musdAmount),
        error: "No wallet found for account",
      })
      continue
    }

    try {
      const { upperHint, lowerHint } = await calculateTroveOperationHints({
        hintHelpers,
        sortedTroves,
        troveManager,
        collateralAmount: 0n,
        debtAmount: musdAmount,
        operation: "adjust",
        isCollIncrease: false,
        isDebtIncrease: true,
        currentCollateral: troveState?.coll,
        currentDebt:
          (troveState?.principal ?? 0n) + (troveState?.interestOwed ?? 0n),
        verbose: true,
      })
      // Record the start time
      const startTime = Date.now()

      // Increase debt transaction
      const tx = await borrowerOperations.connect(wallet).withdrawMUSD(
        musdAmount,
        upperHint, // Upper hint (use zero address for simplicity)
        lowerHint, // Lower hint (use zero address for simplicity)
        {
          gasLimit: 1000000, // Explicitly set a higher gas limit
        },
      )

      console.log(`Transaction sent: ${tx.hash}`)

      // Wait for transaction to be mined
      const receipt = await tx.wait()

      // Calculate metrics
      const endTime = Date.now()
      const duration = endTime - startTime
      const gasUsed = receipt ? receipt.gasUsed : 0n

      console.log(
        `Transaction confirmed! Gas used: ${gasUsed}, Duration: ${duration}ms`,
      )

      // Update results
      results.successful++
      results.gasUsed += gasUsed
      results.transactions.push({
        hash: tx.hash,
        account: account.address,
        musdAmount: ethers.formatEther(musdAmount),
        gasUsed: gasUsed.toString(),
        duration,
      })

      // Record the action in the state manager
      stateManager.recordAction(account.address, "increaseDebt", TEST_ID)
    } catch (error) {
      console.log(`Error increasing debt: ${error.message}`)
      results.failed++
      results.transactions.push({
        account: account.address,
        musdAmount: ethers.formatEther(musdAmount),
        error: error.message,
      })
    }

    // Wait a bit between transactions to avoid network congestion
    if (i < testAccounts.length - 1) {
      console.log("Waiting 2 seconds before next transaction...")
      await new Promise((resolve) => {
        setTimeout(resolve, 2000)
      })
    }
  }

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(`Total accounts processed: ${testAccounts.length}`)
  console.log(`Successful: ${results.successful}`)
  console.log(`Failed: ${results.failed}`)
  console.log(`Total gas used: ${results.gasUsed}`)
  console.log(
    `Average gas per transaction: ${results.successful > 0 ? results.gasUsed / BigInt(results.successful) : 0n}`,
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
          musdAmounts: MUSD_AMOUNTS,
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

  // Update MUSD balances
  console.log("Updating MUSD balances for all accounts...")
  const musdAddress = await getDeploymentAddress("MUSD")
  await stateManager.updateMusdBalances(musdAddress)

  // Update BTC balances
  const updatedBalances = await stateManager.updateBtcBalances()
  console.log(`Updated BTC balances for ${updatedBalances} accounts`)

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
