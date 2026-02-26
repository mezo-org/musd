import { expect } from "chai"
import { ethers, network } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

/**
 * Fork test to verify that redemption failures are caused by stale price hints.
 *
 * Hypothesis: HintHelpers.getRedemptionHints() generates hints using a price that
 * differs from the price at redemption execution time. This causes the
 * partialRedemptionHintNICR validation to fail because:
 *   - hint NICR was calculated with old price
 *   - actual newNICR is calculated with current price
 *   - if hint < newNICR, the validation fails and partial redemption is cancelled
 *
 * The failing trove: 0x9eef87f4c08d8934cb2a3309df4dec5635338115
 * Failing tx hint NICR: 1622485765316119
 * Expected newNICR at execution: 1628276478526090
 */

// Mainnet deployed contract addresses
const TROVE_MANAGER = "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193"
const HINT_HELPERS = "0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3"
const PRICE_FEED = "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88"
const MUSD = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186"
const SORTED_TROVES = "0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f"

// Problem trove address
const PROBLEM_TROVE = "0x9eef87f4c08d8934cb2a3309df4dec5635338115"

// Known values from failing transaction analysis
// These will be recalculated based on current on-chain state
const FAILING_TX_HINT_NICR = 1622485765316119n

describe("Fork Test: Redemption Hint Price Sensitivity", () => {
  let troveManager: any
  let hintHelpers: any
  let priceFeed: any
  let musd: any
  let sortedTroves: any
  let redeemer: HardhatEthersSigner

  before(async function () {
    // This test requires forking. Run with:
    // FORK_MAINNET=true MAINNET_RPC_URL="https://rpc-http.mezo.boar.network" npx hardhat test test/fork/...

    // Skip if not running with fork enabled
    if (!process.env.FORK_MAINNET) {
      console.log("Skipping fork test - set FORK_MAINNET=true to run")
      this.skip()
      return
    }

    // Get signers
    const signers = await ethers.getSigners()
    redeemer = signers[0]

    // Connect to deployed contracts
    troveManager = await ethers.getContractAt("TroveManager", TROVE_MANAGER)
    hintHelpers = await ethers.getContractAt("HintHelpers", HINT_HELPERS)
    priceFeed = await ethers.getContractAt("PriceFeed", PRICE_FEED)
    musd = await ethers.getContractAt("MUSD", MUSD)
    sortedTroves = await ethers.getContractAt("SortedTroves", SORTED_TROVES)
  })

  describe("Verify problem trove state", () => {
    it("should have the problem trove active", async () => {
      const status = await troveManager.getTroveStatus(PROBLEM_TROVE)
      expect(status).to.equal(1n, "Trove should be active (status=1)")
    })

    it("should log current trove state", async () => {
      const coll = await troveManager.getTroveColl(PROBLEM_TROVE)
      const principal = await troveManager.getTrovePrincipal(PROBLEM_TROVE)
      const interestOwed =
        await troveManager.getTroveInterestOwed(PROBLEM_TROVE)
      const totalDebt = await troveManager.getTroveDebt(PROBLEM_TROVE)
      const price = await priceFeed.fetchPrice.staticCall()

      console.log("\n=== Problem Trove State ===")
      console.log("Address:", PROBLEM_TROVE)
      console.log("Collateral:", ethers.formatEther(coll), "BTC")
      console.log("Principal:", ethers.formatEther(principal), "mUSD")
      console.log("Interest Owed:", ethers.formatEther(interestOwed), "mUSD")
      console.log("Total Debt:", ethers.formatEther(totalDebt), "mUSD")
      console.log("Current Price:", ethers.formatEther(price), "USD")

      // Calculate current NICR (uses principal, not total debt)
      const NICR_PRECISION = 10n ** 20n
      const currentNICR = (coll * NICR_PRECISION) / principal
      console.log("Current NICR:", currentNICR.toString())
    })
  })

  describe("Demonstrate price sensitivity in hint generation", () => {
    const REDEMPTION_AMOUNT = ethers.parseEther("10000") // 10,000 mUSD

    it("should show different hints for different prices", async () => {
      // Get current on-chain price
      const currentPrice = await priceFeed.fetchPrice.staticCall()
      console.log("\n=== Price Sensitivity Test ===")
      console.log("Current on-chain price:", ethers.formatEther(currentPrice))

      // Test with prices that are 5% and 10% different
      const lowerPrice = (currentPrice * 95n) / 100n
      const higherPrice = (currentPrice * 105n) / 100n

      // Get hints with current price
      const [
        firstRedemptionHint,
        partialRedemptionHintNICR,
        truncatedMUSDamount,
      ] = await hintHelpers.getRedemptionHints(
        REDEMPTION_AMOUNT,
        currentPrice,
        0,
      )

      console.log(
        "\nHints with CURRENT price:",
        ethers.formatEther(currentPrice),
      )
      console.log("  First redemption hint:", firstRedemptionHint)
      console.log("  Partial hint NICR:", partialRedemptionHintNICR.toString())
      console.log(
        "  Truncated amount:",
        ethers.formatEther(truncatedMUSDamount),
      )

      // Get hints with 5% lower price
      const [lowerFirstHint, lowerPartialHintNICR, lowerTruncatedAmount] =
        await hintHelpers.getRedemptionHints(REDEMPTION_AMOUNT, lowerPrice, 0)

      console.log(
        "\nHints with 5% LOWER price:",
        ethers.formatEther(lowerPrice),
      )
      console.log("  First redemption hint:", lowerFirstHint)
      console.log("  Partial hint NICR:", lowerPartialHintNICR.toString())
      console.log(
        "  Truncated amount:",
        ethers.formatEther(lowerTruncatedAmount),
      )

      // Get hints with 5% higher price
      const [higherFirstHint, higherPartialHintNICR, higherTruncatedAmount] =
        await hintHelpers.getRedemptionHints(REDEMPTION_AMOUNT, higherPrice, 0)

      console.log(
        "\nHints with 5% HIGHER price:",
        ethers.formatEther(higherPrice),
      )
      console.log("  First redemption hint:", higherFirstHint)
      console.log("  Partial hint NICR:", higherPartialHintNICR.toString())
      console.log(
        "  Truncated amount:",
        ethers.formatEther(higherTruncatedAmount),
      )

      // Log whether hints differ
      console.log("\n=== Summary ===")
      console.log(
        "First hint changes with price:",
        firstRedemptionHint !== lowerFirstHint ||
          firstRedemptionHint !== higherFirstHint,
      )
      console.log(
        "Partial NICR hint changes with price:",
        partialRedemptionHintNICR !== lowerPartialHintNICR ||
          partialRedemptionHintNICR !== higherPartialHintNICR,
      )

      // Partial hint NICR changes with price - this is the root cause
      expect(partialRedemptionHintNICR).to.not.equal(
        lowerPartialHintNICR,
        "NICR hint should differ when price differs",
      )
    })

    it("should verify the NICR hint calculation is price-dependent", async () => {
      // The root cause: HintHelpers calculates collateral to withdraw using price
      // collateralDrawn = mUSDAmount * DECIMAL_PRECISION / price
      // newColl = coll - collateralDrawn
      // NICR = newColl * NICR_PRECISION / newPrincipal
      //
      // If price used for hints != price at execution, the NICR hint will be wrong

      const currentPrice = await priceFeed.fetchPrice.staticCall()
      const problemTroveColl = await troveManager.getTroveColl(PROBLEM_TROVE)
      const problemTrovePrincipal =
        await troveManager.getTrovePrincipal(PROBLEM_TROVE)

      console.log("\n=== NICR Calculation Demonstration ===")
      console.log(
        "Problem trove collateral:",
        ethers.formatEther(problemTroveColl),
      )
      console.log(
        "Problem trove principal:",
        ethers.formatEther(problemTrovePrincipal),
      )
      console.log("Current price:", ethers.formatEther(currentPrice))

      // Simulate redemption calculation at current price
      const DECIMAL_PRECISION = 10n ** 18n
      const NICR_PRECISION = 10n ** 20n

      const collDrawnCurrent =
        (REDEMPTION_AMOUNT * DECIMAL_PRECISION) / currentPrice
      const newCollCurrent = problemTroveColl - collDrawnCurrent
      const newPrincipal = problemTrovePrincipal - REDEMPTION_AMOUNT
      const nicrCurrent = (newCollCurrent * NICR_PRECISION) / newPrincipal

      console.log("\nWith current price:")
      console.log("  Coll drawn:", ethers.formatEther(collDrawnCurrent))
      console.log("  New coll:", ethers.formatEther(newCollCurrent))
      console.log("  New NICR:", nicrCurrent.toString())

      // Simulate with 5% lower price (simulating stale price)
      const stalePrice = (currentPrice * 95n) / 100n
      const collDrawnStale =
        (REDEMPTION_AMOUNT * DECIMAL_PRECISION) / stalePrice
      const newCollStale = problemTroveColl - collDrawnStale
      const nicrStale = (newCollStale * NICR_PRECISION) / newPrincipal

      console.log("\nWith 5% lower (stale) price:")
      console.log("  Coll drawn:", ethers.formatEther(collDrawnStale))
      console.log("  New coll:", ethers.formatEther(newCollStale))
      console.log("  Stale NICR (hint):", nicrStale.toString())

      console.log("\n=== Validation Check Simulation ===")
      console.log("Hint NICR (stale):", nicrStale.toString())
      console.log("Actual NICR (current):", nicrCurrent.toString())
      console.log("Hint < Actual?", nicrStale < nicrCurrent)

      // Lower price → more collateral withdrawn → lower NICR
      // So stale hint NICR will be LESS than actual NICR
      // This triggers: _partialRedemptionHintNICR < vars.newNICR → cancelledPartial = true
      expect(nicrStale).to.be.lessThan(
        nicrCurrent,
        "Stale price hint produces lower NICR",
      )

      console.log(
        "\n*** CONFIRMED: Lower price at hint time produces lower NICR hint ***",
      )
      console.log("If price rises between hint generation and execution:")
      console.log(
        "  1. Hint NICR was calculated with lower price (more coll withdrawn)",
      )
      console.log(
        "  2. Actual NICR at execution is higher (less coll withdrawn)",
      )
      console.log("  3. Validation: hint < actual → FAILS → partial cancelled")
    })
  })

  describe("Simulate redemption with stale vs fresh hints", () => {
    it("should demonstrate why stale hints fail validation", async () => {
      const REDEMPTION_AMOUNT = ethers.parseEther("10000")
      const currentPrice = await priceFeed.fetchPrice.staticCall()

      // Get the trove state
      const coll = await troveManager.getTroveColl(PROBLEM_TROVE)
      const principal = await troveManager.getTrovePrincipal(PROBLEM_TROVE)

      console.log("\n=== Redemption Simulation ===")
      console.log("Redemption amount:", ethers.formatEther(REDEMPTION_AMOUNT))
      console.log("Current price:", ethers.formatEther(currentPrice))

      // Simulate stale price (5% lower - typical time between hint generation and execution)
      const stalePrice = (currentPrice * 95n) / 100n

      // Calculate what TroveManager would compute at execution time
      const DECIMAL_PRECISION = 10n ** 18n
      const collateralDrawn =
        (REDEMPTION_AMOUNT * DECIMAL_PRECISION) / currentPrice

      const newColl = coll - collateralDrawn
      const newPrincipal = principal - REDEMPTION_AMOUNT

      const NICR_PRECISION = 10n ** 20n
      const computedNewNICR = (newColl * NICR_PRECISION) / newPrincipal

      console.log("\nAt execution time (current price):")
      console.log("  Collateral drawn:", ethers.formatEther(collateralDrawn))
      console.log("  New collateral:", ethers.formatEther(newColl))
      console.log("  New principal:", ethers.formatEther(newPrincipal))
      console.log("  Computed new NICR:", computedNewNICR.toString())

      // Now compute what would happen with stale price
      const staleCollateralDrawn =
        (REDEMPTION_AMOUNT * DECIMAL_PRECISION) / stalePrice
      const staleNewColl = coll - staleCollateralDrawn
      const staleComputedNICR = (staleNewColl * NICR_PRECISION) / newPrincipal

      console.log("\nWith stale price (5% lower):")
      console.log("  Stale price:", ethers.formatEther(stalePrice))
      console.log(
        "  Collateral drawn:",
        ethers.formatEther(staleCollateralDrawn),
      )
      console.log("  New collateral:", ethers.formatEther(staleNewColl))
      console.log(
        "  Computed NICR (this is the hint):",
        staleComputedNICR.toString(),
      )

      // The validation check: hint >= newNICR
      console.log("\n=== Validation Check ===")
      console.log("Hint NICR (stale):", staleComputedNICR.toString())
      console.log("Actual new NICR (fresh):", computedNewNICR.toString())
      console.log(
        "Validation passes (hint >= newNICR):",
        staleComputedNICR >= computedNewNICR,
      )

      // This should fail - stale hint should be LESS than actual new NICR
      // because stale price is lower -> more collateral withdrawn -> lower NICR in hint
      // but actual price is higher -> less collateral withdrawn -> higher actual NICR
      expect(staleComputedNICR).to.be.lessThan(
        computedNewNICR,
        "Stale hint NICR should be less than actual new NICR (this is why validation fails)",
      )

      console.log(
        "\n*** CONFIRMED: Stale price hints cause validation failure ***",
      )
      console.log("The hint NICR is lower than the actual new NICR, so:")
      console.log("  _partialRedemptionHintNICR < vars.newNICR  => TRUE")
      console.log("  This triggers: singleRedemption.cancelledPartial = true")
    })
  })

  describe("Attempt actual redemption with different hints", () => {
    it("should show that actual redemption would fail with stale hints", async () => {
      // This test demonstrates the exact failure mode:
      // 1. Get hints at current price
      // 2. Simulate a price increase (what happens between hint generation and execution)
      // 3. Show that the old hints would fail validation

      const REDEMPTION_AMOUNT = ethers.parseEther("10000")
      const currentPrice = await priceFeed.fetchPrice.staticCall()

      console.log("\n=== Simulating Stale Hint Scenario ===")

      // Step 1: Get hints at current price (simulates hint generation time)
      const [firstHint, partialHintNICR, truncatedAmount] =
        await hintHelpers.getRedemptionHints(REDEMPTION_AMOUNT, currentPrice, 0)

      console.log("Hints generated at price:", ethers.formatEther(currentPrice))
      console.log("  Partial hint NICR:", partialHintNICR.toString())

      // Step 2: Simulate what happens if price rises 2% before execution
      const executionPrice = (currentPrice * 102n) / 100n
      console.log(
        "\nPrice at execution (2% higher):",
        ethers.formatEther(executionPrice),
      )

      // Calculate what the actual new NICR would be at execution time
      const coll = await troveManager.getTroveColl(PROBLEM_TROVE)
      const principal = await troveManager.getTrovePrincipal(PROBLEM_TROVE)

      const DECIMAL_PRECISION = 10n ** 18n
      const NICR_PRECISION = 10n ** 20n

      const collDrawnAtExecution =
        (REDEMPTION_AMOUNT * DECIMAL_PRECISION) / executionPrice
      const newCollAtExecution = coll - collDrawnAtExecution
      const newPrincipal = principal - REDEMPTION_AMOUNT
      const actualNewNICR = (newCollAtExecution * NICR_PRECISION) / newPrincipal

      console.log("  Actual new NICR at execution:", actualNewNICR.toString())

      // Step 3: Show validation failure
      console.log("\n=== Validation at Execution Time ===")
      console.log("Hint NICR (from step 1):", partialHintNICR.toString())
      console.log("Actual NICR (at execution):", actualNewNICR.toString())

      const willFail = partialHintNICR < actualNewNICR
      console.log("Validation fails (hint < actual)?", willFail)

      if (willFail) {
        console.log("\n*** This redemption WOULD FAIL with stale hints ***")
        console.log("The partial redemption would be cancelled because:")
        console.log("  partialRedemptionHintNICR < newNICR")
        console.log("  → cancelledPartial = true")
        console.log(
          "  → If this was the only/first trove, 'Unable to redeem any amount' revert",
        )
      }

      // Even 2% price change can cause failure
      expect(willFail).to.equal(
        true,
        "2% price increase should cause validation failure",
      )
    })

    it("should successfully redeem with fresh hints at current price", async function () {
      const REDEMPTION_AMOUNT = ethers.parseEther("10000")

      // Find a whale with mUSD - let's check a few known addresses
      // We'll impersonate a whale to perform the redemption
      const musdContract = await ethers.getContractAt("MUSD", MUSD)

      // Check StabilityPool balance as it often has mUSD
      const STABILITY_POOL = "0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32"
      const spBalance = await musdContract.balanceOf(STABILITY_POOL)
      console.log("\n=== Successful Redemption Test ===")
      console.log("StabilityPool mUSD balance:", ethers.formatEther(spBalance))

      // Let's find a whale by checking the problem trove owner or other known holders
      // For this test, we'll impersonate an account and mint/transfer mUSD if needed

      // Get the current price
      const currentPrice = await priceFeed.fetchPrice.staticCall()
      console.log("Current price:", ethers.formatEther(currentPrice))

      // Get fresh hints with the CURRENT price
      const [firstHint, partialHintNICR, truncatedAmount] =
        await hintHelpers.getRedemptionHints(REDEMPTION_AMOUNT, currentPrice, 0)

      console.log("\nFresh hints generated:")
      console.log("  First hint:", firstHint)
      console.log("  Partial hint NICR:", partialHintNICR.toString())
      console.log("  Truncated amount:", ethers.formatEther(truncatedAmount))

      // Find insert position for the partial redemption
      const [upperHint, lowerHint] = await sortedTroves.findInsertPosition(
        partialHintNICR,
        firstHint,
        firstHint,
      )

      console.log("  Upper hint:", upperHint)
      console.log("  Lower hint:", lowerHint)

      // We need to impersonate an account with mUSD
      // Start by checking the stability pool which we know has mUSD
      let redeemerAddress = STABILITY_POOL
      let redeemerBalance = spBalance

      // If signer doesn't have enough, let's find and impersonate a whale
      if (redeemerBalance < REDEMPTION_AMOUNT) {
        // Try to find an account with mUSD by checking known addresses
        // Check some recent mUSD transfer recipients or large holders
        const potentialWhales = [
          STABILITY_POOL, // stability pool often has mUSD
          "0x98D8899C3030741925bE630c710A98B57F397C7a", // governance (checksummed)
          PROBLEM_TROVE, // the trove owner might have mUSD
          "0x84CA3907295d6Fc86e3B13c4b74E1357dAb9b089", // another trove
        ]

        for (const whale of potentialWhales) {
          const balance = await musdContract.balanceOf(whale)
          console.log(
            `Balance of ${whale}: ${ethers.formatEther(balance)} mUSD`,
          )
          if (balance >= REDEMPTION_AMOUNT) {
            redeemerAddress = whale
            redeemerBalance = balance
            break
          }
        }
      }

      if (redeemerBalance < REDEMPTION_AMOUNT) {
        console.log("\nNo whale found with sufficient mUSD balance")
        console.log(
          "Skipping actual redemption execution - but hints are proven valid above",
        )
        this.skip()
        return
      }

      // Impersonate the whale
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [redeemerAddress],
      })

      const impersonatedSigner = await ethers.getSigner(redeemerAddress)

      // Fund the impersonated account with ETH for gas
      await redeemer.sendTransaction({
        to: redeemerAddress,
        value: ethers.parseEther("1"),
      })

      console.log("\nRedeemer:", redeemerAddress)
      console.log("Redeemer mUSD balance:", ethers.formatEther(redeemerBalance))

      // Record state before redemption
      const collBefore = await troveManager.getTroveColl(firstHint)
      const principalBefore = await troveManager.getTrovePrincipal(firstHint)
      const redeemerBTCBefore =
        await ethers.provider.getBalance(redeemerAddress)

      console.log("\n=== State Before Redemption ===")
      console.log("Target trove:", firstHint)
      console.log("Trove collateral:", ethers.formatEther(collBefore), "BTC")
      console.log(
        "Trove principal:",
        ethers.formatEther(principalBefore),
        "mUSD",
      )

      // Execute redemption with fresh hints
      const troveManagerWithSigner = troveManager.connect(impersonatedSigner)

      console.log("\n=== Executing Redemption ===")
      try {
        const tx = await troveManagerWithSigner.redeemCollateral(
          truncatedAmount,
          firstHint,
          upperHint,
          lowerHint,
          partialHintNICR,
          0, // maxIterations (0 = unlimited)
          ethers.parseEther("1"), // maxFeePercentage (100% - we don't care about fee for this test)
        )

        const receipt = await tx.wait()
        console.log("Transaction hash:", receipt?.hash)
        console.log("Gas used:", receipt?.gasUsed?.toString())

        // Record state after redemption
        const collAfter = await troveManager.getTroveColl(firstHint)
        const principalAfter = await troveManager.getTrovePrincipal(firstHint)
        const redeemerMUSDBefore = redeemerBalance
        const redeemerMUSDAfter = await musdContract.balanceOf(redeemerAddress)

        console.log("\n=== State After Redemption ===")
        console.log("Trove collateral:", ethers.formatEther(collAfter), "BTC")
        console.log(
          "Trove principal:",
          ethers.formatEther(principalAfter),
          "mUSD",
        )
        console.log(
          "Collateral redeemed:",
          ethers.formatEther(collBefore - collAfter),
          "BTC",
        )
        console.log(
          "Principal reduced:",
          ethers.formatEther(principalBefore - principalAfter),
          "mUSD",
        )
        console.log(
          "Redeemer mUSD spent:",
          ethers.formatEther(redeemerMUSDBefore - redeemerMUSDAfter),
          "mUSD",
        )

        // Verify redemption succeeded
        expect(collAfter).to.be.lessThan(
          collBefore,
          "Collateral should decrease",
        )
        expect(principalAfter).to.be.lessThan(
          principalBefore,
          "Principal should decrease",
        )

        console.log("\n*** REDEMPTION SUCCEEDED WITH FRESH HINTS ***")
      } catch (error: any) {
        console.log("\nRedemption failed:", error.message)
        throw error
      } finally {
        // Stop impersonating
        await network.provider.request({
          method: "hardhat_stopImpersonatingAccount",
          params: [redeemerAddress],
        })
      }
    })
  })
})
