// scripts/scale-testing/scenarios/redeem-musd.ts
import { ethers } from "hardhat"
import { StateManager } from "../state-manager"
import { WalletHelper } from "../wallet-helper"
import { getDeploymentAddress } from "../../deployment-helpers"

// Configuration
const TEST_ID = "redeem-musd-test"
const NUM_ACCOUNTS = 5 // Number of accounts to use for redemptions
const REDEMPTION_AMOUNT = ethers.parseEther("10") // Fixed amount: 10 MUSD

async function main() {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(`Running Redeem MUSD test on network: ${networkName}`)
  console.log(`Test ID: ${TEST_ID}`)

  // Create state manager
  const stateManager = new StateManager(networkName)

  // Create wallet helper
  const walletHelper = new WalletHelper()

  // Get contract addresses
  const troveManagerAddress = await getDeploymentAddress("TroveManager")
  const musdAddress = await getDeploymentAddress("MUSD")
  const hintHelpersAddress = await getDeploymentAddress("HintHelpers")
  const sortedTrovesAddress = await getDeploymentAddress("SortedTroves")
  const priceFeedAddress = await getDeploymentAddress("PriceFeed")

  console.log(`Using TroveManager at: ${troveManagerAddress}`)
  console.log(`Using MUSD at: ${musdAddress}`)
  console.log(`Using HintHelpers at: ${hintHelpersAddress}`)
  console.log(`Using SortedTroves at: ${sortedTrovesAddress}`)
  console.log(`Using PriceFeed at: ${priceFeedAddress}`)

  // Get contract instances
  const troveManager = await ethers.getContractAt(
    "TroveManager",
    troveManagerAddress,
  )
  const musdToken = await ethers.getContractAt("MUSD", musdAddress)
  const hintHelpers = await ethers.getContractAt(
    "HintHelpers",
    hintHelpersAddress,
  )
  const sortedTroves = await ethers.getContractAt(
    "SortedTroves",
    sortedTrovesAddress,
  )
  const priceFeed = await ethers.getContractAt("PriceFeed", priceFeedAddress)

  // Update MUSD balances
  console.log("Updating MUSD balances for all accounts...")
  await stateManager.updateMusdBalances(musdAddress)
  console.log("MUSD balances updated")

  // Select accounts for testing - accounts with sufficient MUSD balance
  const testAccounts = stateManager.getAccounts({
    minMusdBalance: "2100",
    notUsedInTest: TEST_ID,
    limit: NUM_ACCOUNTS * 2, // Get more accounts than needed in case some can't be used
  })

  console.log(
    `Selected ${testAccounts.length} accounts with sufficient MUSD balance for testing`,
  )

  if (testAccounts.length === 0) {
    console.error(
      `No accounts with at least ${ethers.formatEther(REDEMPTION_AMOUNT)} MUSD balance found.`,
    )
    process.exit(1)
  }

  // Load wallets for these accounts - this is the key step from other scripts
  const addresses = testAccounts.map((account) => account.address)
  const loadedWallets = await walletHelper.loadEncryptedWallets(addresses)
  console.log(`Loaded ${loadedWallets} wallets for testing`)

  // Initialize results object
  const results = {
    successful: 0,
    failed: 0,
    gasUsed: BigInt(0),
    transactions: [],
  }

  // Process accounts
  let successfulTests = 0
  for (
    let i = 0;
    i < testAccounts.length && successfulTests < NUM_ACCOUNTS;
    i++
  ) {
    const account = testAccounts[i]
    console.log(
      `\nProcessing account ${i + 1}/${testAccounts.length}: ${account.address}`,
    )

    try {
      // Get the account's MUSD balance
      const musdBalance = await musdToken.balanceOf(account.address)
      console.log(`MUSD balance: ${ethers.formatEther(musdBalance)} MUSD`)

      if (musdBalance < REDEMPTION_AMOUNT) {
        console.log(
          `Account has insufficient MUSD balance (needs ${ethers.formatEther(REDEMPTION_AMOUNT)}). Skipping.`,
        )
        continue
      }

      // Get a wallet for the account - using the pattern from other scripts
      const wallet = walletHelper.getWallet(account.address)

      if (!wallet) {
        console.log(`No wallet found for account ${account.address}, skipping`)
        continue
      }

      // Debug the wallet
      console.log(`Wallet address: ${wallet.address}`)
      console.log(`Wallet has provider: ${wallet.provider ? "Yes" : "No"}`)

      // Get the current price
      const price = await priceFeed.fetchPrice()
      console.log(`Current price: ${ethers.formatEther(price)} USD`)

      // Get hints for the redemption
      console.log("Getting redemption hints...")
      const {
        firstRedemptionHint,
        partialRedemptionHintNICR,
        truncatedAmount,
      } = await hintHelpers.getRedemptionHints(REDEMPTION_AMOUNT, price, 0)

      console.log(`First redemption hint: ${firstRedemptionHint}`)
      console.log(`Partial redemption hint NICR: ${partialRedemptionHintNICR}`)

      // Get the upper and lower partial redemption hints
      console.log("Finding insert position in sorted troves...")
      const { 0: upperPartialRedemptionHint, 1: lowerPartialRedemptionHint } =
        await sortedTroves.findInsertPosition(
          partialRedemptionHintNICR,
          account.address,
          account.address,
        )

      console.log(
        `Upper partial redemption hint: ${upperPartialRedemptionHint}`,
      )
      console.log(
        `Lower partial redemption hint: ${lowerPartialRedemptionHint}`,
      )

      // Record the start time
      const startTime = Date.now()

      // Perform the redemption
      console.log("Performing redemption...")
      const redemptionTx = await troveManager.connect(wallet).redeemCollateral(
        truncatedAmount,
        firstRedemptionHint,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
        partialRedemptionHintNICR,
        0, // maxIterations
        {
          gasLimit: 5000000, // Higher gas limit for complex operation
        },
      )

      console.log(`Redemption transaction sent: ${redemptionTx.hash}`)

      // Wait for transaction to be mined
      const receipt = await redemptionTx.wait()

      // Calculate metrics
      const endTime = Date.now()
      const duration = endTime - startTime
      const gasUsed = receipt ? receipt.gasUsed : BigInt(0)

      console.log(
        `Redemption confirmed! Gas used: ${gasUsed}, Duration: ${duration}ms`,
      )

      // Update results
      results.successful++
      successfulTests++
      results.gasUsed += gasUsed
      results.transactions.push({
        hash: redemptionTx.hash,
        account: account.address,
        redemptionAmount: ethers.formatEther(REDEMPTION_AMOUNT),
        gasUsed: gasUsed.toString(),
        duration,
      })

      // Record the action in the state manager
      stateManager.recordAction(account.address, "redeemed", TEST_ID)

      // Wait a bit between transactions to avoid network congestion
      if (i < testAccounts.length - 1 && successfulTests < NUM_ACCOUNTS) {
        console.log("Waiting 2 seconds before next transaction...")
        await new Promise((resolve) => {
          setTimeout(resolve, 2000)
        })
      }
    } catch (error) {
      console.log(`Error performing redemption: ${error.message}`)
      results.failed++
      results.transactions.push({
        account: account.address,
        error: error.message,
      })
    }
  }

  // Print summary
  console.log("\n--- Test Summary ---")
  console.log(
    `Total accounts processed: ${results.successful + results.failed}`,
  )
  console.log(`Successful: ${results.successful}`)
  console.log(`Failed: ${results.failed}`)
  console.log(`Total gas used: ${results.gasUsed}`)
  console.log(
    `Average gas per transaction: ${results.successful > 0 ? results.gasUsed / BigInt(results.successful) : BigInt(0)}`,
  )

  // Save results to file
  const fs = require("fs")
  const path = require("path")
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
          redemptionAmount: ethers.formatEther(REDEMPTION_AMOUNT),
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

  // Update MUSD balances
  console.log("\nUpdating MUSD balances for all accounts...")
  await stateManager.updateMusdBalances(musdAddress)

  // Update BTC balances
  console.log("Updating BTC balances for all accounts...")
  await stateManager.updateBtcBalances()

  console.log("Test completed!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in test script:", error)
    process.exit(1)
  })
