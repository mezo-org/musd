import { expect } from "chai"
import {
  applyLiquidationFee,
  Contracts,
  dropPrice,
  getEmittedLiquidationValues,
  getEmittedRedemptionValues,
  NO_GAS,
  openTrove,
  setInterestRate,
  setupTests,
  updatePendingSnapshot,
  updateTroveSnapshot,
  updateTroveSnapshots,
  updateWalletSnapshot,
  User,
} from "../helpers"
import { to1e18 } from "../utils"
import { ZERO_ADDRESS } from "../../helpers/constants"

describe.only("Demo", () => {
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let deployer: User
  let treasury: User
  let contracts: Contracts

  async function setupDefaultTroves() {
    await setInterestRate(contracts, council, 0) // 0% interest rate to make calculations easier

    // open two troves so that we don't go into recovery mode
    await openTrove(contracts, {
      musdAmount: "5000",
      ICR: "400",
      sender: alice.wallet,
    })

    await openTrove(contracts, {
      musdAmount: "50000",
      ICR: "500",
      sender: bob.wallet,
    })
  }

  beforeEach(async () => {
    ;({ alice, bob, carol, deployer, council, treasury, contracts } =
      await setupTests())

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()

    await setupDefaultTroves()
  })

  it("openTrove() without hints", async () => {
    await updateTroveSnapshot(contracts, carol, "before")

    // Amount of MUSD to borrow
    const debtAmount = to1e18(2000)

    // Amount of collateral (in BTC)
    const assetAmount = to1e18(10)

    /**
     * Hints are used to find the correct insert position in the sorted troves
     * list.
     * Trove operations called without hints will have a worst case gas cost of
     * O(n) where n is the number of troves.
     */
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    await contracts.borrowerOperations
      .connect(carol.wallet)
      .openTrove(debtAmount, upperHint, lowerHint, {
        value: assetAmount,
      })

    await updateTroveSnapshot(contracts, carol, "after")
    console.log(carol.trove)

    // Note that Carol's debt is greater than the amount she requested
    // This is because of fees and gas compensation
    expect(carol.trove.debt.after).to.be.greaterThan(debtAmount)
  })

  it("openTrove() with hints", async () => {
    await updateTroveSnapshot(contracts, carol, "before")

    // Amount of MUSD to borrow
    const debtAmount = to1e18(2000)

    // Amount of collateral (in BTC)
    const assetAmount = to1e18(10)

    // Compute hints using HintHelpers and SortedTroves

    // Compute expected total debt by adding gas compensation and fee
    const gasCompensation = await contracts.troveManager.MUSD_GAS_COMPENSATION()
    const expectedFee =
      await contracts.borrowerOperations.getBorrowingFee(debtAmount)
    const expectedTotalDebt = debtAmount + expectedFee + gasCompensation

    // Nominal CR is collateral * 1e20 / totalDebt
    // Note that price is not included in this calculation
    const nicr = (assetAmount * to1e18(100)) / expectedTotalDebt

    // Get an approximate address hint from HintHelpers contract
    // This will on average return a trove that is (length / numTrials) away
    // from the correct insert position.
    // Note you can probably get away with 15 * sqrt(length) trials
    const numTroves = await contracts.sortedTroves.getSize()
    const numTrials = numTroves * 15n
    const randomSeed = 42
    const { 0: approxHint } = await contracts.hintHelpers.getApproxHint(
      nicr,
      numTrials,
      randomSeed,
    )

    // Use the approximate hint to get exact upper and lower hints
    const { 0: upperHint, 1: lowerHint } =
      await contracts.sortedTroves.findInsertPosition(
        nicr,
        approxHint,
        approxHint,
      )

    await contracts.borrowerOperations
      .connect(carol.wallet)
      .openTrove(debtAmount, upperHint, lowerHint, {
        value: assetAmount,
      })

    await updateTroveSnapshot(contracts, carol, "after")
    console.log(carol.trove)
  })

  it("adjustTrove()", async () => {
    await updateTroveSnapshot(contracts, bob, "before")

    // Parameters for a withdrawal of 50 mUSD
    const collWithdrawal = 0
    const debtChange = to1e18("50")
    const isDebtIncrease = true
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    await contracts.borrowerOperations
      .connect(bob.wallet)
      .adjustTrove(
        collWithdrawal,
        debtChange,
        isDebtIncrease,
        upperHint,
        lowerHint,
      )

    await updateTroveSnapshot(contracts, bob, "after")

    // Fetch the borrowing rate as a fee will be applied
    const borrowingRate = await contracts.borrowerOperations.borrowingRate()
    expect(bob.trove.debt.after).to.equal(
      bob.trove.debt.before +
        (debtChange * (to1e18(1) + borrowingRate)) / to1e18(1),
    )

    /**
     * Note this could also have been done with withdrawMUSD()
     * Other trove adjustment convenience functions include:
     * - repayMUSD, addColl, and withdrawColl
     */
  })

  it("adjustTrove in Recovery Mode", async () => {
    // Parameters for a withdrawal of 50 mUSD
    const collWithdrawal = 0
    const debtChange = to1e18("50")
    const isDebtIncrease = true
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    /**
     * Drop the price to put the system into recovery mode.
     * Recovery mode happens when with CR of the system is below the CCR (150%).
     */
    const price = await dropPrice(contracts, deployer, bob, to1e18("100"))
    expect(await contracts.troveManager.getTCR(price)).to.be.lessThan(
      await contracts.troveManager.CCR(),
    )
    expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(true)

    /**
     * Recovery mode limits the adjustments that can be made to those that
     * improve the system CR so we expect this adjustment to revert.
     */
    await expect(
      contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          collWithdrawal,
          debtChange,
          isDebtIncrease,
          upperHint,
          lowerHint,
        ),
    ).to.be.revertedWith(
      "BorrowerOps: Operation must leave trove with ICR >= CCR",
    )
  })

  it("closeTrove()", async () => {
    // Send mUSD to Alice so she has sufficient funds to close the trove
    await contracts.musd
      .connect(bob.wallet)
      .transfer(alice.address, to1e18("10,000"))
    await updateTroveSnapshot(contracts, alice, "before")
    await updateWalletSnapshot(contracts, alice, "before")

    // Repay and close Trove
    // Turning off gas to make values easier to follow
    await contracts.borrowerOperations.connect(alice.wallet).closeTrove(NO_GAS)

    await updateTroveSnapshot(contracts, alice, "after")
    await updateWalletSnapshot(contracts, alice, "after")

    expect(alice.trove.debt.after).to.equal(0)

    /**
     * The debt of the closed trove is removed from Alice's mUSD balance.
     * Note Alice is also refunded gas compensation.
     */
    expect(alice.musd.after).to.equal(
      alice.musd.before -
        alice.trove.debt.before +
        (await contracts.troveManager.MUSD_GAS_COMPENSATION()),
    )

    // Alice's collateral is returned to her wallet
    expect(alice.btc.after - alice.btc.before).to.equal(
      alice.trove.collateral.before,
    )
  })

  it("liquidate() without stability pool", async () => {
    await updateTroveSnapshot(contracts, alice, "before")
    await updatePendingSnapshot(contracts, bob, "before")
    await updateWalletSnapshot(contracts, bob, "before")

    // Drop the price so that Alice's ICR > MCR (110%)
    await dropPrice(contracts, deployer, alice, to1e18("100"))

    // Liquidate Alice
    const liquidationTx = await contracts.troveManager
      .connect(bob.wallet)
      .liquidate(alice.address, NO_GAS)
    const { collGasCompensation } =
      await getEmittedLiquidationValues(liquidationTx)

    await updatePendingSnapshot(contracts, bob, "after")

    /**
     * Bob receives Alice's principal as a pending "reward".
     * If there were multiple users, they would receive shares proportional to
     * their stake of collateral in the system.
     */
    expect(bob.pending.principal.after).to.be.closeTo(
      alice.trove.debt.before,
      100,
    )

    /**
     * Bob receives his share of Alice's collateral, less a liquidation fee of
     * 0.5%.
     */
    expect(bob.pending.collateral.after).to.be.closeTo(
      applyLiquidationFee(alice.trove.collateral.before),
      100,
    )

    await updateWalletSnapshot(contracts, bob, "after")

    /**
     * Bob receives gas compensation for liquidating Alice
     */
    expect(bob.musd.after - bob.musd.before).to.be.equal(
      await contracts.troveManager.MUSD_GAS_COMPENSATION(),
    )

    // Bob receives 0.5% of Alice's collateral as additional compensation
    expect(bob.btc.after - bob.btc.before).to.be.equal(collGasCompensation)
  })

  it("redeemCollateral()", async () => {
    const redemptionAmount = to1e18("50")
    const maxIterations = 0

    /** Hints for redeemCollateral
     * _firstRedemptionHint: first Trove in the system with ICR >= 110%
     *
     * _lowerPartialRedemptionHint and _upperPartialRedemptionHint: neighbors
     * of reinsertion position if a partially redeemed Trove needs to be reinserted
     *
     * _partialRedemptionHintNICR: the expected NICR of the final partially redeemed
     * Trove
     */

    const price = await contracts.priceFeed.fetchPrice()

    // Get redemption hints from HintHelpers contract
    const { firstRedemptionHint, partialRedemptionHintNICR } =
      await contracts.hintHelpers.getRedemptionHints(
        redemptionAmount,
        price,
        maxIterations,
      )

    // Get the approximate partial redemption hint
    const numTroves = await contracts.sortedTroves.getSize()
    const numTrials = numTroves * 15n
    const { hintAddress: approxPartialRedemptionHint } =
      await contracts.hintHelpers.getApproxHint(
        partialRedemptionHintNICR,
        numTrials,
        42,
      )

    // Use the approximate partial redemption hint to get the exact partial
    // redemption hint from SortedTroves
    const { 0: upperPartialRedemptionHint, 1: lowerPartialRedemptionHint } =
      await contracts.sortedTroves.findInsertPosition(
        partialRedemptionHintNICR,
        approxPartialRedemptionHint,
        approxPartialRedemptionHint,
      )

    await updateTroveSnapshots(contracts, [alice, bob], "before")
    await updateWalletSnapshot(contracts, bob, "before")

    const redemptionTx = await contracts.troveManager
      .connect(bob.wallet)
      .redeemCollateral(
        redemptionAmount,
        firstRedemptionHint,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
        partialRedemptionHintNICR,
        maxIterations,
        NO_GAS,
      )

    const { collateralSent, collateralFee } =
      await getEmittedRedemptionValues(redemptionTx)

    await updateTroveSnapshots(contracts, [alice, bob], "after")
    await updateWalletSnapshot(contracts, bob, "after")

    const collateralNeeded = to1e18(redemptionAmount) / price
    const expectedCollateral = collateralNeeded - collateralFee

    expect(collateralSent).to.equal(collateralNeeded)
    expect(bob.btc.after - bob.btc.before).to.be.closeTo(
      expectedCollateral,
      1000,
    )
  })
})
