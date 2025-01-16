import { expect } from "chai"
import { ContractTransactionResponse } from "ethers"
import {
  NO_GAS,
  Contracts,
  ContractsState,
  TestingAddresses,
  User,
  adjustTroveToICR,
  applyLiquidationFee,
  calculateInterestOwed,
  checkTroveActive,
  checkTroveClosedByLiquidation,
  checkTroveClosedByRedemption,
  checkTroveStatus,
  dropPrice,
  dropPriceAndLiquidate,
  fastForwardTime,
  getAllEventsByName,
  getDebtAndCollFromTroveUpdatedEvents,
  getEmittedLiquidationValues,
  getEmittedRedemptionValues,
  getLatestBlockTimestamp,
  getRedemptionHints,
  getTCR,
  openTrove,
  performRedemption,
  provideToSP,
  setBaseRate,
  setupTests,
  transferMUSD,
  updateContractsSnapshot,
  updatePCVSnapshot,
  updatePendingSnapshot,
  updateStabilityPoolUserSnapshot,
  updateStabilityPoolUserSnapshots,
  updateTroveManagerSnapshot,
  updateTroveSnapshot,
  updateTroveSnapshots,
  updateWalletSnapshot,
  updateInterestRateDataSnapshot,
  setInterestRate,
  getTroveEntireDebt,
  TROVE_UPDATED_ABI,
} from "../helpers"
import { to1e18 } from "../utils"

describe("TroveManager in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let deployer: User
  let dennis: User
  let eric: User
  let treasury: User
  let state: ContractsState
  let contracts: Contracts

  async function setupTroves() {
    // open two troves so that we don't go into recovery mode
    await openTrove(contracts, {
      musdAmount: "5000",
      ICR: "400",
      sender: alice.wallet,
    })

    await openTrove(contracts, {
      musdAmount: "50000",
      ICR: "5000",
      sender: bob.wallet,
    })
  }

  /**
   * Contains the setup and expectations for tests that liquidate a sequence of troves with some having ICR < MCR.
   * The expectations are included along with the setup to allow for continuity when reading the test.
   * @param liquidateFunction The function being tested
   */
  async function testLiquidateICRLessThanMCR(
    liquidateFunction: () => Promise<ContractTransactionResponse>,
  ) {
    // Open 2 troves with high ICRs
    await setupTroves()

    // Create 3 more troves with varying ICRs
    await openTrove(contracts, {
      musdAmount: "2000",
      ICR: "200",
      sender: carol.wallet,
    })
    await openTrove(contracts, {
      musdAmount: "2000",
      ICR: "150",
      sender: dennis.wallet,
    })
    await openTrove(contracts, {
      musdAmount: "2000",
      ICR: "450",
      sender: eric.wallet,
    })

    await provideToSP(contracts, bob, to1e18("50,000"))

    // Drop the price such that everyone with an ICR less than Alice (inclusive) can be liquidated
    await dropPrice(contracts, deployer, alice)

    // Confirm we have the correct ICR expectations
    const eligibleUsers = [alice, carol, dennis]
    const ineligibleUsers = [bob, eric]
    await Promise.all(
      eligibleUsers
        .concat(ineligibleUsers)
        .map((user) => updateTroveSnapshot(contracts, user, "after")),
    )
    const mcr = await contracts.troveManager.MCR()
    expect(eligibleUsers).to.satisfy((users: User[]) =>
      users.every((user) => user.trove.icr.after < mcr),
    )
    expect(ineligibleUsers).to.satisfy((users: User[]) =>
      users.every((user) => user.trove.icr.after > mcr),
    )

    // Attempt to liquidate all 5 troves
    await liquidateFunction()

    // Check that eligible troves have been closed by liquidation
    const closedByLiquidation = await Promise.all(
      eligibleUsers.map((user) =>
        checkTroveClosedByLiquidation(contracts, user),
      ),
    )
    expect(closedByLiquidation.every(Boolean)).to.equal(true)

    const stillActive = await Promise.all(
      ineligibleUsers.map((user) => checkTroveActive(contracts, user)),
    )
    expect(stillActive.every(Boolean)).to.equal(true)
  }

  /**
   * Setup troves for tests that need multiple troves with pending rewards and a trove that is skipped during a liquidation
   */
  async function setupTrovesLiquidateWithSkip() {
    await setupTroves()
    await openTrove(contracts, {
      musdAmount: "5000",
      ICR: "120",
      sender: carol.wallet,
    })
    await openTrove(contracts, {
      musdAmount: "5000",
      ICR: "500",
      sender: dennis.wallet,
    })

    // Liquidate Carol, creating pending rewards for everyone
    await dropPriceAndLiquidate(contracts, deployer, carol)

    // Drop price
    await dropPrice(contracts, deployer, alice)
  }

  /**
   * Contains the setup and expectations for tests that liquidate a sequence of troves and check that only the specified
   * troves are liquidated.  The expectations are included along with the setup to allow for continuity when reading the test.
   * @param liquidateFunction The function being tested
   */
  async function testLiquidateOnly(
    liquidateFunction: () => Promise<ContractTransactionResponse>,
  ) {
    await setupTroves()

    // Open 3 more troves with lower ICRs
    await openTrove(contracts, {
      musdAmount: "2000",
      ICR: "200",
      sender: carol.wallet,
    })
    await openTrove(contracts, {
      musdAmount: "2000",
      ICR: "210",
      sender: dennis.wallet,
    })
    await openTrove(contracts, {
      musdAmount: "2000",
      ICR: "220",
      sender: eric.wallet,
    })

    // Drop price so that all 3 troves are eligible for liquidation
    await dropPrice(contracts, deployer, eric)

    // Attempt to liquidate troves
    await liquidateFunction()

    // Check that Carol and Dennis troves have been closed and are no longer in the sorted list
    expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(true)
    expect(await checkTroveClosedByLiquidation(contracts, dennis)).to.equal(
      true,
    )

    // Check that Alice, Bob, and Eric still have active troves
    expect(await checkTroveActive(contracts, alice)).to.equal(true)
    expect(await checkTroveActive(contracts, bob)).to.equal(true)
    expect(await checkTroveActive(contracts, eric)).to.equal(true)
  }

  async function setupTroveWithInterestRate(
    interestRate: number,
    daysToFastForward: number,
  ) {
    await setInterestRate(contracts, council, interestRate)

    await openTrove(contracts, {
      musdAmount: "10,000",
      sender: alice.wallet,
    })

    const daysInSeconds = daysToFastForward * 24 * 60 * 60
    await fastForwardTime(daysInSeconds)
  }

  beforeEach(async () => {
    ;({
      alice,
      bob,
      carol,
      dennis,
      eric,
      deployer,
      council,
      treasury,
      contracts,
      state,
      addresses,
    } = await setupTests())

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()
  })

  describe("liquidate()", () => {
    it("removes liquidated trove's principal and interest from system interest rate data", async () => {
      await setInterestRate(contracts, council, 1000)
      await setupTroves()
      await fastForwardTime(365 * 24 * 60 * 60)
      await updateTroveSnapshots(contracts, [alice, bob], "before")
      await updateInterestRateDataSnapshot(contracts, state, 1000, "before")
      await dropPriceAndLiquidate(contracts, deployer, alice)
      const after = BigInt(await getLatestBlockTimestamp())
      await updateTroveSnapshots(contracts, [alice, bob], "after")
      await updateInterestRateDataSnapshot(contracts, state, 1000, "after")
      expect(
        state.interestRateManager.interestRateData[1000].principal.after,
      ).to.equal(bob.trove.debt.after)
      expect(
        state.interestRateManager.interestRateData[1000].interest.after,
      ).to.equal(
        calculateInterestOwed(
          bob.trove.debt.before,
          1000,
          bob.trove.lastInterestUpdateTime.before,
          after,
        ),
      )
    })

    it("removes liquidated trove's principal and interest from system interest rate data including pending rewards", async () => {
      await setInterestRate(contracts, council, 1000)
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "150",
        sender: carol.wallet,
      })
      await fastForwardTime(365 * 24 * 60 * 60)
      // liquidate Carol to create pending rewards for everyone
      await dropPriceAndLiquidate(contracts, deployer, carol)
      await updateTroveSnapshots(contracts, [alice, bob], "before")
      await updateInterestRateDataSnapshot(contracts, state, 1000, "before")
      await dropPriceAndLiquidate(contracts, deployer, alice)
      const after = BigInt(await getLatestBlockTimestamp())
      await updateTroveSnapshots(contracts, [alice, bob], "after")
      await updateInterestRateDataSnapshot(contracts, state, 1000, "after")
      expect(
        state.interestRateManager.interestRateData[1000].principal.after,
      ).to.equal(bob.trove.debt.after)
      expect(
        state.interestRateManager.interestRateData[1000].interest.after,
      ).to.equal(
        calculateInterestOwed(
          bob.trove.debt.before,
          1000,
          bob.trove.lastInterestUpdateTime.before,
          after,
        ),
      )
    })

    it("removes the Trove's stake from the total stakes", async () => {
      await setupTroves()
      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before")
      await updateTroveManagerSnapshot(contracts, state, "before")

      expect(state.troveManager.stakes.before).to.equal(
        alice.trove.stake.before + bob.trove.stake.before,
      )

      // price drops reducing Alice's ICR below MCR
      await dropPriceAndLiquidate(contracts, deployer, alice)

      await updateTroveManagerSnapshot(contracts, state, "after")
      expect(state.troveManager.stakes.after).to.equal(bob.trove.stake.before)
    })

    it("Removes the correct trove from the TroveOwners array, and moves the last array element to the new empty slot", async () => {
      await setupTroves()
      // Open additional troves
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "218",
        sender: carol.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "216",
        sender: dennis.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "214",
        sender: eric.wallet,
      })

      /*
       Our TroveOwners array should now be: [Alice, Bob, Carol, Dennis, Eric].
       Note they are not sorted by ICR but by insertion order.
      */
      await updateTroveManagerSnapshot(contracts, state, "before")
      expect(state.troveManager.troves.before).to.equal(5)

      // Drop the price to lower ICRs below MCR and close Carol's trove
      await dropPriceAndLiquidate(contracts, deployer, carol)

      // Check that carol no longer has an active trove
      expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
        false,
      )

      // Check that the TroveOwners array has been updated correctly
      await updateTroveManagerSnapshot(contracts, state, "after")
      expect(state.troveManager.troves.after).to.equal(4)

      /* After Carol is removed from the array, the last element (Eric's address) should have been moved to fill the
       * empty slot left by Carol. The TroveOwners array should now be: [Bob, Alice, Eric, Dennis] */
      const troveOwners = await Promise.all(
        [0, 1, 2, 3].map((index) => contracts.troveManager.TroveOwners(index)),
      )

      expect(troveOwners).to.deep.equal([
        addresses.alice,
        addresses.bob,
        addresses.eric,
        addresses.dennis,
      ])

      // Check that the correct indices are recorded on the active trove structs
      await updateTroveSnapshots(contracts, [alice, bob, eric, dennis], "after")

      expect(alice.trove.arrayIndex.after).to.equal(0)
      expect(bob.trove.arrayIndex.after).to.equal(1)
      expect(eric.trove.arrayIndex.after).to.equal(2)
      expect(dennis.trove.arrayIndex.after).to.equal(3)
    })

    it("Given the same price and no other trove changes, complete Pool offsets restore the TCR to its prior value after liquidation of multiple defaulters", async () => {
      await setupTroves()
      // Approve up to $10k to be sent to the stability pool for Bob.
      await provideToSP(contracts, bob, to1e18("10,000"))

      await updateTroveManagerSnapshot(contracts, state, "before")

      // Open additional troves with low enough ICRs that they will default on a small price drop
      await openTrove(contracts, {
        musdAmount: "1800",
        ICR: "120",
        sender: carol.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "120",
        sender: dennis.wallet,
      })

      // price drops reducing ICRs below MCR
      const price = await contracts.priceFeed.fetchPrice()
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice((price * 80n) / 100n)

      // liquidate defaulters
      await contracts.troveManager.liquidate(carol.wallet.address)
      await contracts.troveManager.liquidate(dennis.wallet.address)

      // Check defaulters are removed
      expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
        false,
      )
      expect(await contracts.sortedTroves.contains(dennis.wallet)).to.equal(
        false,
      )

      // Price bounces back
      await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)

      // Check TCR is restored
      await updateTroveManagerSnapshot(contracts, state, "after")
      expect(state.troveManager.TCR.after).to.equal(
        state.troveManager.TCR.before,
      )
    })

    it("Pool offsets increase the TCR", async () => {
      await setupTroves()
      await provideToSP(contracts, bob, to1e18("10,000"))

      // Open additional troves with low enough ICRs that they will default on a small price drop
      await openTrove(contracts, {
        musdAmount: "1800",
        ICR: "120",
        sender: carol.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "120",
        sender: dennis.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "3000",
        ICR: "120",
        sender: eric.wallet,
      })

      // price drops reducing ICRs below MCR
      const price = await contracts.priceFeed.fetchPrice()
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice((price * 80n) / 100n)

      // Check TCR improves with each liquidation that is offset with Pool
      const tcrBefore = await getTCR(contracts)
      await contracts.troveManager.liquidate(carol.wallet.address)
      const tcr2 = await getTCR(contracts)
      expect(tcr2).to.be.greaterThan(tcrBefore)

      await contracts.troveManager.liquidate(dennis.wallet.address)
      const tcr3 = await getTCR(contracts)
      expect(tcr3).to.be.greaterThan(tcr2)

      await contracts.troveManager.liquidate(eric.wallet.address)
      const tcr4 = await getTCR(contracts)
      expect(tcr4).to.be.greaterThan(tcr3)
    })

    it("a pure redistribution reduces the TCR only as a result of compensation if the interest rate is 0%", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "1800",
        ICR: "120",
        sender: carol.wallet,
      })

      // price drops reducing ICR below MCR
      const price = await contracts.priceFeed.fetchPrice()
      const newPrice = (price * 80n) / 100n
      await contracts.mockAggregator.connect(deployer.wallet).setPrice(newPrice)

      const tcrBefore = await getTCR(contracts)
      const entireSystemCollBefore =
        await contracts.troveManager.getEntireSystemColl()
      const entireSystemDebtBefore =
        await contracts.troveManager.getEntireSystemDebt()

      expect(
        (entireSystemCollBefore * newPrice) / entireSystemDebtBefore,
      ).to.equal(tcrBefore)

      // Check TCR does not decrease with each liquidation
      const liquidationTx = await contracts.troveManager.liquidate(
        carol.wallet.address,
      )
      const { collGasCompensation } =
        await getEmittedLiquidationValues(liquidationTx)

      const tcrAfter = await getTCR(contracts)

      const remainingColl =
        (entireSystemCollBefore - collGasCompensation) * newPrice

      expect(remainingColl).to.equal(
        (await contracts.troveManager.getEntireSystemColl()) * newPrice,
      )

      const remainingDebt = entireSystemDebtBefore
      expect(remainingDebt).to.equal(
        await contracts.troveManager.getEntireSystemDebt(),
      )

      expect(tcrAfter).to.equal(remainingColl / remainingDebt)
    })

    it("a pure redistribution reduces the TCR due to compensation and interest", async () => {
      await setInterestRate(contracts, council, 1000)
      await setupTroves()

      // Open trove to be liquidated
      await openTrove(contracts, {
        musdAmount: "1800",
        ICR: "120",
        sender: carol.wallet,
      })

      await updateInterestRateDataSnapshot(contracts, state, 1000, "before")
      await updateTroveSnapshot(contracts, carol, "before")
      await updateTroveManagerSnapshot(contracts, state, "before")

      const entireSystemCollBefore =
        await contracts.troveManager.getEntireSystemColl()

      // Fast-forward 1 year
      await fastForwardTime(365 * 24 * 60 * 60)

      // Liquidate trove
      const { newPrice, liquidationTx } = await dropPriceAndLiquidate(
        contracts,
        deployer,
        carol,
      )
      await updateTroveSnapshot(contracts, carol, "after")
      const { collGasCompensation } = await getEmittedLiquidationValues(
        liquidationTx!,
      )

      // Calculate interest on total system debt
      const interestOwed =
        calculateInterestOwed(
          state.interestRateManager.interestRateData[1000].principal.before,
          1000,
          carol.trove.lastInterestUpdateTime.before,
          carol.trove.lastInterestUpdateTime.after,
        ) + state.interestRateManager.interestRateData[1000].interest.before

      // Calculate expected tcr
      const remainingColl =
        (entireSystemCollBefore - collGasCompensation) * newPrice
      const remainingDebt =
        state.interestRateManager.interestRateData[1000].principal.before +
        interestOwed

      await updateTroveManagerSnapshot(contracts, state, "after")

      expect(state.troveManager.TCR.after).to.equal(
        remainingColl / remainingDebt,
      )
    })

    it("does not affect the SP deposit or collateral gain when called on an SP depositor's address that has no trove", async () => {
      await setupTroves()
      const spDeposit = to1e18(10000)

      // Bob sends tokens to Dennis, who has no trove
      await contracts.musd.connect(bob.wallet).approve(dennis.wallet, spDeposit)
      const allowance = await contracts.musd.allowance(
        bob.wallet.address,
        dennis.wallet.address,
      )
      expect(allowance).to.equal(spDeposit)
      await contracts.musd
        .connect(bob.wallet)
        .transfer(dennis.wallet, spDeposit, { from: bob.wallet })

      // Dennis provides mUSD to SP
      await provideToSP(contracts, dennis, spDeposit)

      // Alice gets liquidated
      await dropPriceAndLiquidate(contracts, deployer, alice)

      // Dennis' SP deposit has absorbed Carol's debt, and he has received her liquidated collateral
      await updateStabilityPoolUserSnapshot(contracts, dennis, "before")

      // Attempt to liquidate Dennis
      await expect(
        contracts.troveManager.liquidate(dennis.wallet.address),
      ).to.be.revertedWith("TroveManager: Trove does not exist or is closed")

      // Check Dennis' SP deposit does not change after liquidation attempt
      await updateStabilityPoolUserSnapshot(contracts, dennis, "after")
      expect(dennis.stabilityPool.compoundedDeposit.after).to.equal(
        dennis.stabilityPool.compoundedDeposit.before,
      )
      expect(dennis.stabilityPool.collateralGain.after).to.equal(
        dennis.stabilityPool.collateralGain.before,
      )
    })

    it("does not liquidate a SP depositor's trove with ICR > 110%, and does not affect their SP deposit or collateral gain", async () => {
      await setupTroves()
      const spDeposit = to1e18(10000)
      await provideToSP(contracts, bob, spDeposit)

      // liquidate Alice
      const { newPrice } = await dropPriceAndLiquidate(
        contracts,
        deployer,
        alice,
      )

      // check Bob's ICR > MCR
      expect(
        await contracts.troveManager.getCurrentICR(bob.address, newPrice),
      ).to.be.greaterThan(await contracts.troveManager.MCR())

      // check Bob's SP deposit and collateral gain before liquidation
      await updateStabilityPoolUserSnapshot(contracts, bob, "before")

      // Attempt to liquidate Bob
      await expect(
        contracts.troveManager.liquidate(bob.wallet.address),
      ).to.be.revertedWith("TroveManager: nothing to liquidate")

      // Check that Bob's SP deposit and collateral gain have not changed
      await updateStabilityPoolUserSnapshot(contracts, bob, "after")

      expect(bob.stabilityPool.compoundedDeposit.after).to.equal(
        bob.stabilityPool.compoundedDeposit.before,
      )
      expect(bob.stabilityPool.collateralGain.after).to.equal(
        bob.stabilityPool.collateralGain.before,
      )
    })

    it("liquidates a SP depositor's trove with ICR < 110%, and the liquidation correctly impacts their SP deposit and collateral gain", async () => {
      // Open three troves: Alice, Bob, Carol
      await openTrove(contracts, {
        musdAmount: "50000",
        ICR: "800",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "1000000",
        ICR: "2000",
        sender: bob.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: carol.wallet,
      })

      await updateTroveSnapshot(contracts, carol, "before")
      await updateTroveSnapshot(contracts, alice, "before")

      // Alice deposits into the stability pool
      const aliceSPDeposit = to1e18(25000)
      await provideToSP(contracts, alice, aliceSPDeposit)
      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      // Price drops, carol gets liquidated
      await dropPriceAndLiquidate(contracts, deployer, carol)

      // Alice's deposit should decrease by Carol's debt
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")
      expect(alice.stabilityPool.compoundedDeposit.after).to.be.closeTo(
        aliceSPDeposit - carol.trove.debt.before,
        1000000n,
      )

      // Alice's collateral gain should increase by Carol's collateral less the liquidation fee
      expect(alice.stabilityPool.collateralGain.after).to.be.closeTo(
        applyLiquidationFee(carol.trove.collateral.before),
        1000n,
      )

      // Bob deposits into the stability pool
      const bobSPDeposit = to1e18(50000)
      await provideToSP(contracts, bob, bobSPDeposit)

      // Price drops, Alice gets liquidated
      await updateTroveSnapshot(contracts, alice, "after")
      await dropPriceAndLiquidate(contracts, deployer, alice)

      // Alice's new deposit should decrease by her share of her own debt
      const totalDeposits =
        alice.stabilityPool.compoundedDeposit.after + bobSPDeposit
      const aliceShareOfDebt =
        (alice.trove.debt.after * alice.stabilityPool.compoundedDeposit.after) /
        totalDeposits
      const aliceExpectedDeposit =
        alice.stabilityPool.compoundedDeposit.after - aliceShareOfDebt
      const aliceDepositFinal =
        await contracts.stabilityPool.getCompoundedMUSDDeposit(alice.wallet)
      expect(aliceDepositFinal).to.be.closeTo(aliceExpectedDeposit, 1000000n)

      // Alice's new collateral gain should increase by her share of her own collateral less the liquidation fee
      const aliceCollateralShare =
        (applyLiquidationFee(alice.trove.collateral.after) *
          alice.stabilityPool.compoundedDeposit.after) /
        totalDeposits
      const aliceExpectedCollateralGain =
        alice.stabilityPool.collateralGain.after + aliceCollateralShare
      const aliceCollateralGainFinal =
        await contracts.stabilityPool.getDepositorCollateralGain(alice.wallet)
      expect(aliceCollateralGainFinal).to.be.closeTo(
        aliceExpectedCollateralGain,
        1000000n,
      )

      // Bob's new deposit should decrease by his share of Alice's debt
      const bobShareOfDebt =
        (alice.trove.debt.after * bobSPDeposit) / totalDeposits
      const bobExpectedDeposit = bobSPDeposit - bobShareOfDebt
      await updateStabilityPoolUserSnapshot(contracts, bob, "after")
      expect(bobExpectedDeposit).to.be.closeTo(
        bob.stabilityPool.compoundedDeposit.after,
        1000000n,
      )
      // Bob's new collateral gain should increase by his share of Alice's collateral less the liquidation fee
      const bobCollateralShare =
        (applyLiquidationFee(alice.trove.collateral.after) * bobSPDeposit) /
        totalDeposits
      expect(bob.stabilityPool.collateralGain.after).to.be.closeTo(
        bobCollateralShare,
        1000000n,
      )
    })

    it("liquidates a SP depositor's trove with ICR < 110%, and the liquidation correctly impacts their SP deposit and collateral gain accounting for interest", async () => {
      await setInterestRate(contracts, council, 1000)

      // Open two troves: Alice, Bob
      await openTrove(contracts, {
        musdAmount: "50000",
        ICR: "800",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: bob.wallet,
      })
      await updateTroveSnapshot(contracts, bob, "before")

      const aliceSPDeposit = to1e18(10000)
      await provideToSP(contracts, alice, aliceSPDeposit)
      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      await fastForwardTime(365 * 24 * 60 * 60)

      await dropPriceAndLiquidate(contracts, deployer, bob)

      const expectedInterest = calculateInterestOwed(
        bob.trove.debt.before,
        1000,
        BigInt(bob.trove.lastInterestUpdateTime.before),
        BigInt(await getLatestBlockTimestamp()),
      )

      // Alice's deposit should decrease by Bob's debt and accrued interest
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")
      expect(alice.stabilityPool.compoundedDeposit.after).to.be.closeTo(
        aliceSPDeposit - bob.trove.debt.before - expectedInterest,
        1000000n,
      )
    })

    it("updates the snapshots of total stakes and total collateral", async () => {
      await setupTroves()
      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before") // not strictly necessary but for completeness

      expect(await contracts.troveManager.totalStakesSnapshot()).to.equal(0n)
      expect(await contracts.troveManager.totalCollateralSnapshot()).to.equal(
        0n,
      )

      // Drop the price to lower ICRs below MCR and close Alice's trove
      await dropPriceAndLiquidate(contracts, deployer, alice)

      // Total stakes should be equal to Bob's stake
      await updateTroveSnapshot(contracts, bob, "after")
      expect(await contracts.troveManager.totalStakesSnapshot()).to.equal(
        bob.trove.stake.after,
      )

      /*
       Total collateral should be equal to Bob's collateral plus his pending collateral reward (Alice's collateral less liquidation fee)
       earned from the liquidation of Alice's trove
      */
      const expectedCollateral =
        bob.trove.collateral.after +
        applyLiquidationFee(alice.trove.collateral.before)
      expect(await contracts.troveManager.totalCollateralSnapshot()).to.equal(
        expectedCollateral,
      )
    })

    it("updates the L_Collateral reward-per-unit-staked totals", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "130",
        sender: carol.wallet,
      })

      await updateTroveSnapshots(contracts, [alice, bob, carol], "before")
      await dropPriceAndLiquidate(contracts, deployer, carol)

      // Carol's collateral less the liquidation fee should be added to the default pool
      const liquidatedColl = to1e18(
        applyLiquidationFee(carol.trove.collateral.before),
      )

      expect(await contracts.troveManager.L_Collateral()).to.equal(
        liquidatedColl /
          (bob.trove.collateral.before + alice.trove.collateral.before),
      )
    })

    it("updates the L_Principal reward-per-unit-staked totals", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "130",
        sender: carol.wallet,
      })

      await updateTroveSnapshots(contracts, [alice, bob, carol], "before")
      await dropPriceAndLiquidate(contracts, deployer, carol)

      expect(await contracts.troveManager.L_Principal()).to.equal(
        to1e18(carol.trove.debt.before) /
          (bob.trove.collateral.before + alice.trove.collateral.before),
      )
    })

    it("updates the L_Interest reward-per-unit-staked totals", async () => {
      const interestRate = 1000
      await setInterestRate(contracts, council, interestRate)
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "130",
        sender: carol.wallet,
      })

      await fastForwardTime(365 * 24 * 60 * 60) // fast forward 1 year.

      await updateTroveSnapshots(contracts, [alice, bob, carol], "before")
      await dropPriceAndLiquidate(contracts, deployer, carol)
      const carolLiquidationTime = BigInt(await getLatestBlockTimestamp())

      const expectedLInterestAfterCarolLiquidated =
        to1e18(
          calculateInterestOwed(
            carol.trove.debt.before,
            interestRate,
            carol.trove.lastInterestUpdateTime.before,
            carolLiquidationTime,
          ),
        ) /
        (bob.trove.collateral.before + alice.trove.collateral.before)

      expect(await contracts.troveManager.L_Interest()).to.equal(
        expectedLInterestAfterCarolLiquidated,
      )
    })

    it("updates the L_Collateral reward-per-unit-staked totals after multiple liquidations", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "130",
        sender: carol.wallet,
      })

      await updateTroveSnapshots(contracts, [alice, bob, carol], "before")
      await dropPriceAndLiquidate(contracts, deployer, carol)

      // Carol's collateral less the liquidation fee should be added to the default pool
      const liquidatedColl = to1e18(
        applyLiquidationFee(carol.trove.collateral.before),
      )

      const expectedLCollateralAfterCarolLiquidated =
        liquidatedColl /
        (bob.trove.collateral.before + alice.trove.collateral.before)

      await updatePendingSnapshot(contracts, alice, "before")

      await dropPriceAndLiquidate(contracts, deployer, alice)

      /*
       * Alice's pending reward was applied to her trove before liquidation.  We account for that here using the previous
       * L_Collateral value computed after Carol's liquidation.
       */
      const aliceCollWithPending = to1e18(
        applyLiquidationFee(
          alice.trove.collateral.before + alice.pending.collateral.before,
        ),
      )

      // Bob now has all the active stake. We now add the reward-per-unit-staked
      // from Alice's liquidation to the L_Collateral.
      const expectedLCollateralAfterAliceLiquidated =
        expectedLCollateralAfterCarolLiquidated +
        aliceCollWithPending / bob.trove.collateral.before

      expect(await contracts.troveManager.L_Collateral()).to.be.closeTo(
        expectedLCollateralAfterAliceLiquidated,
        100n,
      )
    })

    it("updates the L_Principal reward-per-unit-staked totals after multiple liquidations", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "130",
        sender: carol.wallet,
      })

      await updateTroveSnapshots(contracts, [alice, bob, carol], "before")
      await dropPriceAndLiquidate(contracts, deployer, carol)

      const lPrincipalAfterCarolLiquidated =
        to1e18(carol.trove.debt.before) /
        (bob.trove.collateral.before + alice.trove.collateral.before)

      await updatePendingSnapshot(contracts, alice, "before")

      await dropPriceAndLiquidate(contracts, deployer, alice)

      // Apply Alice's pending debt rewards and calculate the new LMUSDDebt
      const expectedLPrincipalAfterAliceLiquidated =
        lPrincipalAfterCarolLiquidated +
        to1e18(alice.trove.debt.before + alice.pending.principal.before) /
          bob.trove.collateral.before

      expect(await contracts.troveManager.L_Principal()).to.be.closeTo(
        expectedLPrincipalAfterAliceLiquidated,
        100n,
      )
    })

    it("updates the L_Interest reward-per-unit-staked totals after multiple liquidations", async () => {
      const interestRate = 1000
      await setInterestRate(contracts, council, interestRate)
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "130",
        sender: carol.wallet,
      })

      await fastForwardTime(365 * 24 * 60 * 60) // fast forward 1 year.

      await updateTroveSnapshots(contracts, [alice, bob, carol], "before")
      await dropPriceAndLiquidate(contracts, deployer, carol)
      const carolLiquidationTime = BigInt(await getLatestBlockTimestamp())

      const lInterestAfterCarolLiquidated =
        to1e18(
          calculateInterestOwed(
            carol.trove.debt.before,
            interestRate,
            carol.trove.lastInterestUpdateTime.before,
            carolLiquidationTime,
          ),
        ) /
        (bob.trove.collateral.before + alice.trove.collateral.before)

      await updatePendingSnapshot(contracts, alice, "before")

      await dropPriceAndLiquidate(contracts, deployer, alice)

      const aliceLiquidateTime = BigInt(await getLatestBlockTimestamp())

      const defaultInterestAccruedBetweenCarolAndAlice = to1e18(
        calculateInterestOwed(
          carol.trove.debt.before,
          interestRate,
          carolLiquidationTime,
          aliceLiquidateTime,
        ),
      )

      const pendingDebtLUpdated =
        lInterestAfterCarolLiquidated +
        defaultInterestAccruedBetweenCarolAndAlice / bob.trove.collateral.before

      const expectedLInterestAfterAliceLiquidated =
        pendingDebtLUpdated +
        to1e18(
          calculateInterestOwed(
            alice.trove.debt.before,
            interestRate,
            alice.trove.lastInterestUpdateTime.before,
            aliceLiquidateTime,
          ) + alice.pending.interest.before,
        ) /
          bob.trove.collateral.before

      expect(await contracts.troveManager.L_Interest()).to.be.closeTo(
        expectedLInterestAfterAliceLiquidated,
        100n,
      )
    })

    it("closes a Trove that has ICR < MCR", async () => {
      await setupTroves()
      // Alice's Trove has ICR = 4, which is above the MCR
      await updateTroveSnapshot(contracts, alice, "before")
      expect(alice.trove.icr.before).to.equal(to1e18(4))

      const mcr = (await contracts.troveManager.MCR()).toString()
      expect(mcr).to.equal(to1e18(1.1))

      const targetICR = 1111111111111111111n

      // Alice increases debt to lower her ICR to 1.111111111111111111
      await adjustTroveToICR(contracts, alice.wallet, targetICR)

      await updateTroveSnapshot(contracts, alice, "after")
      expect(alice.trove.icr.after).to.equal(targetICR)

      // price drops reducing Alice's ICR below MCR
      const newPrice = to1e18(1000)
      await contracts.mockAggregator.connect(deployer.wallet).setPrice(newPrice)

      alice.trove.icr.after = await contracts.troveManager.getCurrentICR(
        addresses.alice,
        newPrice,
      )
      expect(alice.trove.icr.after).to.be.lt(mcr)

      // close trove
      await contracts.troveManager.liquidate(alice.wallet.address)

      // check the Trove is successfully closed, and removed from sortedList
      await updateTroveSnapshot(contracts, alice, "after")
      expect(alice.trove.status.after).to.equal(3) // status enum 3 corresponds to "Closed by liquidation"

      const aliceTroveIsInSortedList = await contracts.sortedTroves.contains(
        alice.wallet.address,
      )

      expect(aliceTroveIsInSortedList).to.equal(false)
    })

    it("Liquidates undercollateralized trove if there are two troves in the system", async () => {
      await setupTroves()
      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before")

      // price drops reducing Alice's ICR below MCR
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice(to1e18(1000))

      await updateTroveSnapshot(contracts, alice, "after")
      await updateTroveSnapshot(contracts, bob, "after")
      expect(alice.trove.icr.after).to.be.lt(to1e18(1.1))

      expect(await contracts.troveManager.getTroveOwnersCount()).to.equal(2)

      // Close trove
      await contracts.troveManager.liquidate(alice.wallet.address)

      // Check Alice's trove is removed, and bob remains
      expect(await contracts.troveManager.getTroveOwnersCount()).to.equal(1)
      expect(
        await contracts.sortedTroves.contains(alice.wallet.address),
      ).to.equal(false)
      expect(
        await contracts.sortedTroves.contains(bob.wallet.address),
      ).to.equal(true)
    })

    it("does nothing if trove has >= 110% ICR", async () => {
      await setupTroves()
      await updateTroveManagerSnapshot(contracts, state, "before")

      // Attempt to liquidate Alice
      await expect(
        contracts.troveManager.liquidate(alice.wallet.address),
      ).to.be.revertedWith("TroveManager: nothing to liquidate")

      // Check Alice and Bob are still active
      expect(
        await contracts.sortedTroves.contains(alice.wallet.address),
      ).to.equal(true)
      expect(
        await contracts.sortedTroves.contains(bob.wallet.address),
      ).to.equal(true)

      await updateTroveManagerSnapshot(contracts, state, "after")
      expect(state.troveManager.troves.before).to.equal(
        state.troveManager.troves.after,
      )

      expect(state.troveManager.TCR.before).to.equal(
        state.troveManager.TCR.after,
      )
    })

    it("liquidates based on entire collateral/debt (including pending rewards), not raw collateral/debt", async () => {
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "400",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "221",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: carol.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: dennis.wallet,
      })

      // Drop the price
      const currentPrice = await contracts.priceFeed.fetchPrice()
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice(currentPrice / 2n)

      // Before liquidation, Alice and Bob are above MCR, Carol is below
      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before")
      await updateTroveSnapshot(contracts, carol, "before")

      const mcr = await contracts.troveManager.MCR()
      expect(alice.trove.icr.before).to.be.above(mcr)
      expect(bob.trove.icr.before).to.be.above(mcr)
      expect(carol.trove.icr.before).to.be.below(mcr)

      // Liquidate Dennis, his collateral and debt should be distributed between the others
      await contracts.troveManager.liquidate(dennis.address)

      await updateTroveSnapshot(contracts, alice, "after")
      await updateTroveSnapshot(contracts, bob, "after")
      await updateTroveSnapshot(contracts, carol, "after")
      expect(alice.trove.icr.after).to.be.above(mcr)
      expect(bob.trove.icr.after).to.be.below(mcr)
      expect(carol.trove.icr.after).to.be.below(mcr)

      // Bob's ICR including pending rewards is below the MCR, but his raw coll and debt have not changed
      expect(bob.trove.debt.after).to.equal(bob.trove.debt.before)
      expect(bob.trove.collateral.after).to.equal(bob.trove.collateral.before)

      // Whale (Eric) enters the system, ensuring we don't go into recovery mode
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "1000",
        sender: eric.wallet,
      })

      // Attempt to Liquidate Alice, Bob, and Carol
      await expect(
        contracts.troveManager.liquidate(alice.wallet.address),
      ).to.be.revertedWith("TroveManager: nothing to liquidate")
      await contracts.troveManager.liquidate(bob.address)
      await contracts.troveManager.liquidate(carol.address)

      expect(await checkTroveActive(contracts, alice)).to.equal(true)
      expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(true)
      expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(
        true,
      )
    })

    it("liquidates based on actual ICR including interest", async () => {
      await setInterestRate(contracts, council, 1000)
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "400",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2,000",
        ICR: "111",
        sender: bob.wallet,
      })

      // Bob is still above MCR
      await expect(
        contracts.troveManager.liquidate(bob.wallet.address),
      ).to.be.revertedWith("TroveManager: nothing to liquidate")

      await fastForwardTime(365 * 24 * 60 * 60)

      // Bob is now below MCR due to interest
      await contracts.troveManager.liquidate(bob.wallet.address)
      expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(true)
    })

    it("does not alter the liquidated user's token balance", async () => {
      await setupTroves()
      await dropPriceAndLiquidate(contracts, deployer, alice)
      expect(await contracts.musd.balanceOf(alice.wallet)).to.equal(
        to1e18("5200"),
      )
    })

    it("decreases ActivePool collateral and MUSDDebt by correct amounts", async () => {
      await setupTroves()
      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before")

      // check ActivePool collateral
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )
      const expectedCollateralBefore =
        alice.trove.collateral.before + bob.trove.collateral.before
      expect(state.activePool.collateral.before).to.equal(
        expectedCollateralBefore,
      )
      expect(state.activePool.btc.before).to.equal(expectedCollateralBefore)

      // check mUSD Debt
      expect(state.activePool.debt.before).to.equal(
        alice.trove.debt.before + bob.trove.debt.before,
      )

      /* Close Alice's Trove. Should liquidate her collateral and mUSD,
       * leaving Bob’s collateral and mUSD debt in the ActivePool. */
      await dropPriceAndLiquidate(contracts, deployer, alice)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.collateral.after).to.equal(
        bob.trove.collateral.before,
      )
      expect(state.activePool.btc.after).to.equal(bob.trove.collateral.before)

      // check ActivePool mUSD debt
      expect(state.activePool.debt.after).to.equal(bob.trove.debt.before)
    })

    it("decreases ActivePool collateral, principal, and interest owed by correct amounts", async () => {
      await setInterestRate(contracts, council, 1000)
      await setupTroves()

      await fastForwardTime(365 * 24 * 60 * 60)

      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      // Close Alice's Trove
      await dropPriceAndLiquidate(contracts, deployer, alice)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )
      const after = await getLatestBlockTimestamp()

      expect(state.activePool.collateral.after).to.equal(
        bob.trove.collateral.before,
      )
      expect(state.activePool.btc.after).to.equal(bob.trove.collateral.before)
      expect(state.activePool.principal.after).to.equal(bob.trove.debt.before)

      // ActivePool interest should only include Bob's interest
      const expectedInterest = calculateInterestOwed(
        bob.trove.debt.before,
        1000,
        bob.trove.lastInterestUpdateTime.before,
        BigInt(after),
      )

      expect(state.activePool.interest.after).to.equal(expectedInterest)
      expect(state.activePool.debt.after).to.equal(
        bob.trove.debt.before + expectedInterest,
      )
    })

    it("increases DefaultPool collateral and mUSD debt by correct amounts", async () => {
      await setupTroves()
      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "before",
        addresses,
      )

      // check DefaultPool collateral
      expect(state.defaultPool.collateral.before).to.equal(0n)
      expect(state.defaultPool.btc.before).to.equal(0n)

      // check mUSD Debt
      expect(state.defaultPool.debt.before).to.equal(0n)

      await dropPriceAndLiquidate(contracts, deployer, alice)

      // DefaultPool collateral should increase by Alice's collateral less the liquidation fee
      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "after",
        addresses,
      )
      const expectedDefaultPoolCollateral = applyLiquidationFee(
        alice.trove.collateral.before,
      )
      expect(state.defaultPool.collateral.after).to.equal(
        expectedDefaultPoolCollateral,
      )
      expect(state.defaultPool.btc.after).to.equal(
        expectedDefaultPoolCollateral,
      )

      // DefaultPool total debt after should increase by Alice's total debt
      expect(state.defaultPool.debt.after).to.equal(alice.trove.debt.before)
    })

    it("increases DefaultPool collateral, principal, and interest owed by correct amounts", async () => {
      await setInterestRate(contracts, council, 1000)
      await setupTroves()

      await fastForwardTime(365 * 24 * 60 * 60)

      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveSnapshot(contracts, bob, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "before",
        addresses,
      )

      await dropPriceAndLiquidate(contracts, deployer, alice)
      await updateTroveSnapshot(contracts, alice, "after")

      // DefaultPool collateral should increase by Alice's collateral less the liquidation fee
      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "after",
        addresses,
      )
      const expectedDefaultPoolCollateral = applyLiquidationFee(
        alice.trove.collateral.before,
      )
      expect(state.defaultPool.collateral.after).to.equal(
        expectedDefaultPoolCollateral,
      )
      expect(state.defaultPool.btc.after).to.equal(
        expectedDefaultPoolCollateral,
      )

      expect(state.defaultPool.principal.after).to.equal(
        alice.trove.debt.before,
      )

      const expectedInterest = calculateInterestOwed(
        alice.trove.debt.before,
        1000,
        alice.trove.lastInterestUpdateTime.before,
        alice.trove.lastInterestUpdateTime.after,
      )
      expect(state.defaultPool.interest.after).to.equal(expectedInterest)
      expect(state.defaultPool.debt.after).to.equal(
        alice.trove.debt.before + expectedInterest,
      )
    })

    context("Expected Reverts", () => {
      it("reverts if trove has been closed", async () => {
        await setupTroves()
        await updateTroveSnapshot(contracts, alice, "before")

        // price drops reducing Alice's ICR below MCR
        await dropPriceAndLiquidate(contracts, deployer, alice)

        // Check Alice's trove is removed
        expect(
          await contracts.sortedTroves.contains(alice.wallet.address),
        ).to.equal(false)

        // Try to close the trove again
        await expect(
          contracts.troveManager.liquidate(alice.wallet.address),
        ).to.be.revertedWith("TroveManager: Trove does not exist or is closed")
      })
    })
  })

  describe("batchLiquidateTroves()", () => {
    it("liquidates a Trove that was skipped in a previous liquidation and has pending rewards", async () => {
      await setupTrovesLiquidateWithSkip()
      // attempt to liquidate Alice, Bob, and Dennis. Bob and Dennis are skipped
      await contracts.troveManager.batchLiquidateTroves([
        alice.wallet,
        bob.wallet,
        dennis.wallet,
      ])

      // Drop the price so that Dennis is at risk for liquidation
      await dropPrice(contracts, deployer, dennis)
      await updateTroveSnapshots(contracts, [bob, dennis], "after")

      // Liquidate 2 troves, Dennis should get liquidated and Bob should remain
      await contracts.troveManager.batchLiquidateTroves([
        bob.wallet,
        dennis.wallet,
      ])
      expect(
        await contracts.sortedTroves.contains(dennis.wallet.address),
      ).to.equal(false)
      expect(
        await contracts.sortedTroves.contains(bob.wallet.address),
      ).to.equal(true)
    })

    it("closes every trove with ICR < MCR in the given array", async () => {
      await testLiquidateICRLessThanMCR(() =>
        contracts.troveManager.batchLiquidateTroves([
          alice.wallet,
          bob.wallet,
          carol.wallet,
          dennis.wallet,
          eric.wallet,
        ]),
      )
    })

    it("does not liquidate troves that are not in the given array", async () => {
      await testLiquidateOnly(() =>
        contracts.troveManager.batchLiquidateTroves([
          carol.wallet,
          dennis.wallet,
        ]),
      )
    })

    it("does not close troves with ICR >= MCR in the given array", async () => {
      await setupTroves()

      // Open a trove with lower ICR
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "200",
        sender: carol.wallet,
      })

      // Drop price to make only Carol eligible for liquidation
      await dropPrice(contracts, deployer, carol)

      // Attempt to liquidate everyone
      await contracts.troveManager.batchLiquidateTroves([
        alice.wallet,
        bob.wallet,
        carol.wallet,
      ])

      expect(await checkTroveActive(contracts, alice)).to.equal(true)
      expect(await checkTroveActive(contracts, bob)).to.equal(true)
      expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(
        true,
      )
    })

    it("skips if trove is non-existent", async () => {
      await setupTroves()

      // Drop price so we can liquidate everyone as Bob has the highest ICR
      await dropPrice(contracts, deployer, bob)

      // Attempt to liquidate Alice, Bob, and Carol (who has no trove)
      await contracts.troveManager.batchLiquidateTroves([
        alice.wallet,
        bob.wallet,
        carol.wallet,
      ])

      // Check that Carol's trove is non-existent
      expect(await checkTroveStatus(contracts, carol, 0n, false)).to.equal(true)
    })

    it("skips if a trove has been closed", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: carol.wallet,
      })

      // Send mUSD to Carol so she can close her trove
      await contracts.musd
        .connect(bob.wallet)
        .transfer(carol.address, to1e18("1000"))

      await contracts.borrowerOperations.connect(carol.wallet).closeTrove()

      // Drop the price so Alice and Carol would be eligible for liquidation but not bob
      await dropPrice(contracts, deployer, alice)
      await contracts.troveManager.batchLiquidateTroves([
        alice.wallet,
        bob.wallet,
        carol.wallet,
      ])

      // Check Carol's trove is closed by user
      expect(await checkTroveStatus(contracts, carol, 2n, false)).to.equal(true)

      // Bob is active and Alice is closed by liquidation
      expect(await checkTroveActive(contracts, bob)).to.equal(true)
      expect(await checkTroveClosedByLiquidation(contracts, alice)).to.equal(
        true,
      )
    })

    it("A batch liquidation containing Pool offsets increases the TCR", async () => {
      await setupTroves()

      // Open a couple more troves with the same ICR as Alice
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "400",
        sender: carol.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "400",
        sender: dennis.wallet,
      })

      // Bob provides funds to SP
      await provideToSP(contracts, bob, to1e18("10,000"))

      // Drop the price to make everyone but Bob eligible for liquidation and snapshot the TCR
      await dropPrice(contracts, deployer, alice)
      await updateTroveManagerSnapshot(contracts, state, "before")

      // Perform liquidation and check that TCR has improved
      await contracts.troveManager.batchLiquidateTroves(
        [alice, bob, carol, dennis].map((user) => user.wallet),
      )

      await updateTroveManagerSnapshot(contracts, state, "after")
      expect(state.troveManager.TCR.after).to.be.greaterThan(
        state.troveManager.TCR.before,
      )
    })

    it("A batch liquidation of pure redistributions decreases the TCR, due to gas compensation, but up to 0.5%", async () => {
      await setupTroves()

      // Open a couple more troves with the same ICR as Alice
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "400",
        sender: carol.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "400",
        sender: dennis.wallet,
      })

      // Drop the price to make everyone but Bob eligible for liquidation and snapshot the TCR
      await dropPrice(contracts, deployer, alice)
      await updateTroveManagerSnapshot(contracts, state, "before")

      // Perform liquidation and check that TCR has decreased
      await contracts.troveManager.batchLiquidateTroves(
        [alice, bob, carol, dennis].map((user) => user.wallet),
      )

      await updateTroveManagerSnapshot(contracts, state, "after")
      expect(state.troveManager.TCR.before).to.be.greaterThan(
        state.troveManager.TCR.after,
      )

      // Check that the TCR has decreased by no more than the liquidation fee
      expect(state.troveManager.TCR.after).to.be.greaterThanOrEqual(
        applyLiquidationFee(state.troveManager.TCR.before),
      )
    })

    it("a pure redistribution reduces the TCR due to gas compensation and interest", async () => {
      await setInterestRate(contracts, council, 1000)
      await setupTroves()

      await openTrove(contracts, {
        musdAmount: "1800",
        ICR: "120",
        sender: carol.wallet,
      })

      await updateInterestRateDataSnapshot(contracts, state, 1000, "before")
      await updateTroveSnapshot(contracts, carol, "before")
      await updateTroveManagerSnapshot(contracts, state, "before")

      const entireSystemCollBefore =
        await contracts.troveManager.getEntireSystemColl()

      await fastForwardTime(365 * 24 * 60 * 60)

      const newPrice = await dropPrice(contracts, deployer, carol)

      const liquidationTx = await contracts.troveManager.batchLiquidateTroves([
        carol.wallet,
      ])

      await updateTroveSnapshot(contracts, carol, "after")
      const { collGasCompensation } =
        await getEmittedLiquidationValues(liquidationTx)

      // Calculate interest on total system debt
      const after = await getLatestBlockTimestamp()
      const interestOwed =
        calculateInterestOwed(
          state.interestRateManager.interestRateData[1000].principal.before,
          1000,
          carol.trove.lastInterestUpdateTime.before,
          BigInt(after),
        ) + state.interestRateManager.interestRateData[1000].interest.before

      // Calculate expected tcr
      const remainingColl =
        (entireSystemCollBefore - collGasCompensation) * newPrice
      const remainingDebt =
        state.interestRateManager.interestRateData[1000].principal.before +
        interestOwed

      await updateTroveManagerSnapshot(contracts, state, "after")

      expect(state.troveManager.TCR.after).to.equal(
        remainingColl / remainingDebt,
      )
    })

    it("liquidates based on entire/collateral debt (including pending rewards), not raw collateral/debt", async () => {
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "400",
        sender: alice.wallet,
      })

      // Open a trove for Bob, then two troves with slightly lower ICRs for Carol and Dennis
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200.01",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: carol.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: dennis.wallet,
      })

      // Drop the price so that Carol and Dennis are at risk for liquidation, but do not liquidate anyone yet
      const newPrice = await dropPrice(contracts, deployer, dennis)

      // Check that Bob's ICR is above the MCR after the price drop and before liquidation
      await updateTroveSnapshot(contracts, bob, "before")
      const mcr = await contracts.troveManager.MCR()
      expect(bob.trove.icr.before).to.be.greaterThan(mcr)

      // Liquidate Dennis, creating rewards for everyone
      await contracts.troveManager.liquidate(dennis.wallet)

      // Check that Bob's ICR is below the MCR following liquidation
      await updateTroveSnapshot(contracts, bob, "after")
      expect(bob.trove.icr.after).to.be.lessThan(mcr)

      // Check that Bob's raw ICR (debt and coll less pending rewards) is above the MCR
      const rawICR =
        (bob.trove.collateral.after * newPrice) / bob.trove.debt.after
      expect(rawICR).to.be.greaterThan(mcr)

      // Attempt to liquidate all troves
      await contracts.troveManager.batchLiquidateTroves(
        [carol, bob, alice].map((user) => user.wallet),
      )

      // Check that Alice stays active and Carol and Bob get liquidated
      expect(await checkTroveActive(contracts, alice)).to.equal(true)
      expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(true)
      expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(
        true,
      )
    })

    it("liquidates based on actual ICR including interest", async () => {
      await setInterestRate(contracts, council, 1000)
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "1000",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2,000",
        ICR: "150",
        sender: bob.wallet,
      })

      // Drop the price so Bob is just above MCR
      await dropPrice(contracts, deployer, bob, to1e18("111"))

      await fastForwardTime(365 * 24 * 60 * 60)

      await contracts.troveManager.batchLiquidateTroves([bob.wallet])
      expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(true)
    })

    it("does not affect the liquidated user's token balances", async () => {
      await setupTroves()
      await updateWalletSnapshot(contracts, alice, "before")
      await updateWalletSnapshot(contracts, bob, "before")

      // Attempt to liquidate both troves, only Alice gets liquidated
      await dropPrice(contracts, deployer, alice)

      await contracts.troveManager.batchLiquidateTroves([
        alice.wallet,
        bob.wallet,
      ])

      await updateWalletSnapshot(contracts, alice, "after")
      await updateWalletSnapshot(contracts, bob, "after")

      // Balances should remain unchanged except for gas compensation
      expect(alice.musd.after).to.equal(alice.musd.before + to1e18("200"))
      expect(bob.musd.after).to.equal(bob.musd.before)
    })

    it("Liquidating troves with SP deposits correctly impacts their SP deposit and collateral gain", async () => {
      // Open three troves: Alice, Bob, Carol
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "2000",
        sender: carol.wallet,
      })

      // All deposit into the stability pool
      const aliceDeposit = to1e18("500")
      const bobDeposit = to1e18("1000")
      const carolDeposit = to1e18("3000")
      await provideToSP(contracts, alice, aliceDeposit)
      await provideToSP(contracts, bob, bobDeposit)
      await provideToSP(contracts, carol, carolDeposit)

      await updateTroveSnapshots(contracts, [alice, bob, carol], "before")

      // Price drops so we can liquidate Alice and Bob
      await dropPriceAndLiquidate(contracts, deployer, alice, false)

      await updateStabilityPoolUserSnapshots(
        contracts,
        [alice, bob, carol],
        "before",
      )

      await contracts.troveManager.batchLiquidateTroves([
        alice.wallet,
        bob.wallet,
      ])

      // Check that each user's deposit has decreased by their share of the total liquidated debt
      const totalDeposits = aliceDeposit + bobDeposit + carolDeposit
      const liquidatedDebt = alice.trove.debt.before + bob.trove.debt.before
      await updateStabilityPoolUserSnapshots(
        contracts,
        [alice, bob, carol],
        "after",
      )

      expect(
        aliceDeposit - (liquidatedDebt * aliceDeposit) / totalDeposits,
      ).to.be.closeTo(alice.stabilityPool.compoundedDeposit.after, 1000)
      expect(
        bobDeposit - (liquidatedDebt * bobDeposit) / totalDeposits,
      ).to.be.closeTo(bob.stabilityPool.compoundedDeposit.after, 1000)
      expect(
        carolDeposit - (liquidatedDebt * carolDeposit) / totalDeposits,
      ).to.be.closeTo(carol.stabilityPool.compoundedDeposit.after, 10000)

      // Check that each user's collateral gain has increased by their share of the total liquidated collateral
      const liquidatedColl = applyLiquidationFee(
        alice.trove.collateral.before + bob.trove.collateral.before,
      )
      expect((liquidatedColl * aliceDeposit) / totalDeposits).to.be.closeTo(
        alice.stabilityPool.collateralGain.after,
        1000,
      )
      expect((liquidatedColl * bobDeposit) / totalDeposits).to.be.closeTo(
        bob.stabilityPool.collateralGain.after,
        1000,
      )
      expect((liquidatedColl * carolDeposit) / totalDeposits).to.be.closeTo(
        carol.stabilityPool.collateralGain.after,
        10000,
      ) // TODO Determine correct error tolerance
    })

    context("Expected Reverts", () => {
      it("reverts if array is empty", async () => {
        await setupTroves()
        await dropPrice(contracts, deployer, alice)
        await expect(
          contracts.troveManager.batchLiquidateTroves([]),
        ).to.be.revertedWith(
          "TroveManager: Calldata address array must not be empty",
        )
      })
    })
  })

  describe("getCurrentICR()", () => {
    it("reflects interest owed", async () => {
      const interestRate = 100
      await setInterestRate(contracts, council, interestRate)

      const { totalDebt } = await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: carol.wallet,
      })

      await updateTroveSnapshot(contracts, carol, "before")
      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds
      const currentTime = BigInt(await getLatestBlockTimestamp())

      await updateTroveSnapshot(contracts, carol, "after")

      const price = await contracts.priceFeed.fetchPrice()
      const expectedDebt =
        carol.trove.debt.before +
        calculateInterestOwed(
          totalDebt,
          interestRate,
          carol.trove.lastInterestUpdateTime.before,
          currentTime,
        )
      const expectedICR = (carol.trove.collateral.before * price) / expectedDebt

      expect(carol.trove.icr.after).to.equal(expectedICR)
    })
  })

  describe("getRedemptionHints()", () => {
    it("gets the address of the first Trove and the final ICR of the last Trove involved in a redemption", async () => {
      // Open Troves for Alice and Bob
      const { totalDebt, musdAmount, collateral } = await openTrove(contracts, {
        musdAmount: "2100",
        ICR: "310",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "290",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "250",
        sender: carol.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "120",
        sender: dennis.wallet,
      })

      // Drop the price so that Dennis has an ICR below MCR, she should be untouched by redemptions
      const price = await dropPrice(contracts, deployer, dennis)

      await updateTroveSnapshots(
        contracts,
        [alice, bob, carol, dennis],
        "before",
      )

      const partialRedemptionAmount = to1e18("100")
      const redemptionAmount =
        carol.trove.debt.before +
        bob.trove.debt.before +
        partialRedemptionAmount

      const maxRedeemableMUSD =
        totalDebt - musdAmount - partialRedemptionAmount + to1e18("200") // Partial redemption amount + 200 mUSD for gas comp
      const netMUSDdebt = totalDebt - to1e18("200")
      const newColl = collateral - to1e18(maxRedeemableMUSD) / price

      const newDebt = netMUSDdebt - maxRedeemableMUSD
      const compositeDebt = newDebt + to1e18("200")

      const nominalICR = (newColl * to1e18("100")) / compositeDebt

      const { firstRedemptionHint, partialRedemptionHintNICR } =
        await contracts.hintHelpers.getRedemptionHints(
          redemptionAmount,
          price,
          0,
        )

      expect(firstRedemptionHint).to.equal(carol.address)
      expect(partialRedemptionHintNICR).to.equal(nominalICR)
    })

    it("returns 0 as partialRedemptionHintNICR when reaching _maxIterations", async () => {
      // Open three troves
      await openTrove(contracts, {
        musdAmount: "25000",
        ICR: "300",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "15000",
        ICR: "250",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "200",
        sender: carol.wallet,
      })

      const price = await contracts.priceFeed.fetchPrice()

      // Try to redeem 10k mUSD.  At least 2 iterations should be needed for total redemption of the given amount.
      const { partialRedemptionHintNICR } =
        await contracts.hintHelpers.getRedemptionHints(
          to1e18("10,000"),
          price,
          1,
        )

      expect(partialRedemptionHintNICR).to.equal(0)
    })
  })

  describe("redeemCollateral()", () => {
    async function setupRedemptionTroves() {
      // Open three troves with ascending ICRs
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "300",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "400",
        sender: carol.wallet,
      })

      // Open another trove for Dennis with a very high ICR
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "4000",
        sender: dennis.wallet,
      })

      await updateTroveSnapshots(
        contracts,
        [alice, bob, carol, dennis],
        "before",
      )

      await updateWalletSnapshot(contracts, dennis, "before")
    }

    async function checkCollateralAndDebtValues(
      redemptionTx: ContractTransactionResponse,
      redemptionAmount: bigint,
      price: bigint,
    ) {
      const { collateralSent, collateralFee } =
        await getEmittedRedemptionValues(redemptionTx)

      // Calculate the amount of collateral needed to redeem the given amount of mUSD
      const collNeeded = to1e18(redemptionAmount) / price

      await updateTroveSnapshots(
        contracts,
        [alice, bob, carol, dennis],
        "after",
      )

      // Check that Dennis received the correct amount of collateral and the emitted values match
      await updateWalletSnapshot(contracts, dennis, "after")
      expect(dennis.btc.after - dennis.btc.before).to.be.closeTo(
        collNeeded - collateralFee,
        1000,
      )
      expect(collateralSent).to.equal(collNeeded)

      // Alice's trove's debt should be reduced by redemption amount
      expect(alice.trove.debt.before - alice.trove.debt.after).to.equal(
        redemptionAmount,
      )

      // Check that Alice's collateral has decreased by the correct amount
      expect(
        alice.trove.collateral.before - alice.trove.collateral.after,
      ).to.equal(collNeeded)
    }

    async function redeemWithFee(
      feePercentage: number,
      redemptionAmount: bigint = to1e18("100"),
    ) {
      const price = await contracts.priceFeed.fetchPrice()
      const fee = to1e18(feePercentage) / 100n

      const {
        firstRedemptionHint,
        partialRedemptionHintNICR,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
      } = await getRedemptionHints(contracts, dennis, redemptionAmount, price)

      return contracts.troveManager
        .connect(dennis.wallet)
        .redeemCollateral(
          redemptionAmount,
          firstRedemptionHint,
          upperPartialRedemptionHint,
          lowerPartialRedemptionHint,
          partialRedemptionHintNICR,
          0,
          fee,
          NO_GAS,
        )
    }

    it("ends the redemption sequence when the token redemption request has been filled", async () => {
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("2010") // Redeem an amount equal to Alice's net debt

      await contracts.troveManager
        .connect(dennis.wallet)
        .redeemCollateral(
          redemptionAmount,
          alice.address,
          alice.address,
          alice.address,
          0,
          0,
          to1e18("1"),
          NO_GAS,
        )

      await updateTroveSnapshots(
        contracts,
        [alice, bob, carol, dennis],
        "after",
      )

      expect(alice.trove.debt.after).to.equal(0n)

      const otherUsers = [bob, carol, dennis]

      // Debt should remain unchanged for other troves
      const debtChanges = await Promise.all(
        otherUsers.map(
          (user) => user.trove.debt.after - user.trove.debt.before === 0n,
        ),
      )
      expect(debtChanges.every(Boolean)).to.equal(true)

      // Other troves should still be active
      const stillActive = await Promise.all(
        otherUsers.map((user) => checkTroveActive(contracts, user)),
      )
      expect(stillActive.every(Boolean)).to.equal(true)

      // Alice's trove should be closed by redemption
      expect(await checkTroveClosedByRedemption(contracts, alice)).to.equal(
        true,
      )
    })

    it("ends the redemption sequence when max iterations have been reached", async () => {
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("6030") // Redeem an amount equal to Alice, Bob, and Carol's net debt

      await contracts.troveManager.connect(dennis.wallet).redeemCollateral(
        redemptionAmount,
        alice.address,
        alice.address,
        alice.address,
        0,
        2, // Max redemptions set to 2, so we will stop after Bob's trove
        to1e18("1"),
        NO_GAS,
      )

      await updateTroveSnapshots(
        contracts,
        [alice, bob, carol, dennis],
        "after",
      )

      expect(alice.trove.debt.after).to.equal(0n)
      expect(bob.trove.debt.after).to.equal(0n)

      const otherUsers = [carol, dennis]

      // Debt should remain unchanged for other troves
      const debtChanges = await Promise.all(
        otherUsers.map(
          (user) => user.trove.debt.after - user.trove.debt.before === 0n,
        ),
      )
      expect(debtChanges.every(Boolean)).to.equal(true)

      // Other troves should still be active
      const stillActive = await Promise.all(
        otherUsers.map((user) => checkTroveActive(contracts, user)),
      )
      expect(stillActive.every(Boolean)).to.equal(true)

      // Alice and Bob's troves should be closed by redemption
      expect(await checkTroveClosedByRedemption(contracts, alice)).to.equal(
        true,
      )
      expect(await checkTroveClosedByRedemption(contracts, bob)).to.equal(true)
    })

    it("performs partial redemption if resultant debt is > minimum net debt", async () => {
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("4120") // Alice and Bob's net debt + 100 mUSD
      await performRedemption(contracts, dennis, dennis, redemptionAmount)

      // Check that Alice and Bob's troves are closed by redemption
      expect(await checkTroveClosedByRedemption(contracts, alice)).to.equal(
        true,
      )
      expect(await checkTroveClosedByRedemption(contracts, bob)).to.equal(true)

      // Check that Carol's trove is still active
      expect(await checkTroveActive(contracts, carol)).to.equal(true)

      // Check that Carol's debt has been reduced by 100 mUSD because of the partial redemption
      await updateTroveSnapshot(contracts, carol, "after")
      expect(carol.trove.debt.after - carol.trove.debt.before).to.equal(
        to1e18("-100"),
      )
    })

    it("doesn't perform partial redemption if resultant debt would be < minimum net debt", async () => {
      await setupRedemptionTroves()

      // Alice and Bob's net debt + 300 mUSD.  A partial redemption of 300 mUSD would put Carol below minimum net debt
      const redemptionAmount = to1e18("4320")

      await performRedemption(contracts, dennis, dennis, redemptionAmount)

      // Check that Alice and Bob's troves are closed by redemption
      expect(await checkTroveClosedByRedemption(contracts, alice)).to.equal(
        true,
      )
      expect(await checkTroveClosedByRedemption(contracts, bob)).to.equal(true)

      // Check that Carol's trove is still active
      expect(await checkTroveActive(contracts, carol)).to.equal(true)

      // Check that Carol's debt is untouched because no partial redemption was performed
      await updateTroveSnapshot(contracts, carol, "after")
      expect(carol.trove.debt.after - carol.trove.debt.before).to.equal(0n)
    })

    it("doesnt perform the final partial redemption in the sequence if the hint is out-of-date", async () => {
      await setupRedemptionTroves()

      // Dennis plans to redeem Alice and Bob's troves, plus a partial redemption from Carol
      const aliceAndBobNetDebt = to1e18("4020")
      const partialRedemptionAmount = to1e18("100")

      const redemptionAmount = aliceAndBobNetDebt + partialRedemptionAmount
      const price = await contracts.priceFeed.fetchPrice()

      // Calculate Dennis's hints
      const {
        firstRedemptionHint,
        partialRedemptionHintNICR,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
      } = await getRedemptionHints(contracts, dennis, redemptionAmount, price)

      const {
        firstRedemptionHint: f,
        partialRedemptionHintNICR: p,
        upperPartialRedemptionHint: u,
        lowerPartialRedemptionHint: l,
      } = await getRedemptionHints(contracts, dennis, to1e18("10"), price)

      // Carol redeems 10 mUSD from Alice's trove ahead of Dennis's redemption
      await contracts.troveManager
        .connect(carol.wallet)
        .redeemCollateral(to1e18("10"), f, u, l, p, 0, to1e18("1"), NO_GAS)

      // Dennis tries to redeem with outdated hint
      await contracts.troveManager
        .connect(dennis.wallet)
        .redeemCollateral(
          redemptionAmount,
          firstRedemptionHint,
          upperPartialRedemptionHint,
          lowerPartialRedemptionHint,
          partialRedemptionHintNICR,
          0,
          to1e18("1"),
          NO_GAS,
        )

      // Check that Carol's debt is untouched because no partial redemption was performed
      await updateTroveSnapshot(contracts, carol, "after")
      expect(carol.trove.debt.after - carol.trove.debt.before).to.equal(0n)
    })

    it("doesn't touch Troves with ICR < 110%", async () => {
      await setupRedemptionTroves()

      // Drop the price so that Alice's trove is below MCR
      await dropPrice(contracts, deployer, alice)
      const redemptionAmount = to1e18("100")

      await performRedemption(contracts, dennis, dennis, redemptionAmount)

      await updateTroveSnapshots(contracts, [alice], "after")

      // Alice's trove should be untouched
      expect(alice.trove.debt.after - alice.trove.debt.before).to.equal(0n)
      expect(
        alice.trove.collateral.after - alice.trove.collateral.before,
      ).to.equal(0n)
    })

    it("finds the last Trove with ICR == 110% even if there is more than one", async () => {
      // Open 3 troves with the same ICR
      const users = [alice, bob, carol]

      // Sum the total debt of all 3 troves
      const sumTotalDebt = await users.reduce(async (acc, user) => {
        const { totalDebt } = await openTrove(contracts, {
          musdAmount: "2000",
          ICR: "200",
          sender: user.wallet,
        })
        return (await acc) + totalDebt
      }, Promise.resolve(0n))

      // Open a trove for Dennis with a slightly lower ICR
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "180",
        sender: dennis.wallet,
      })

      // Open a trove for Eric that will keep us out of recovery mode
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "2000",
        sender: eric.wallet,
      })

      await updateTroveSnapshot(contracts, dennis, "before")

      // Drop price to put the first 3 troves at 110 ICR
      await dropPrice(contracts, deployer, alice, to1e18("110"))

      // Try to trick redeemCollateral with hint that doesn't point to the last Trove with ICR == 110
      await contracts.troveManager.connect(dennis.wallet).redeemCollateral(
        sumTotalDebt,
        carol.address, // last trove with ICR == 110 should be Alice
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
        0,
        to1e18("1"),
        NO_GAS,
      )

      await updateTroveSnapshot(contracts, dennis, "after")

      // Check that all Troves with ICR === 110 have been closed
      const closedByRedemption = await Promise.all(
        users.map((user) => checkTroveClosedByRedemption(contracts, user)),
      )
      expect(closedByRedemption.every(Boolean)).to.equal(true)

      // Check that Dennis's trove has not been touched
      expect(dennis.trove.debt.after).to.equal(dennis.trove.debt.before)
    })

    it("a full redemption (leaving trove with 0 debt), closes the trove", async () => {
      await setupRedemptionTroves()
      await performRedemption(contracts, dennis, dennis, to1e18("2010")) // Full redemption on Alice's trove
      expect(await checkTroveClosedByRedemption(contracts, alice)).to.equal(
        true,
      )
    })

    it("cancels the provided mUSD with debt from Troves with the lowest ICRs and sends an equivalent amount of collateral", async () => {
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("200")
      const price = await contracts.priceFeed.fetchPrice()

      const redemptionTx = await performRedemption(
        contracts,
        dennis,
        dennis,
        redemptionAmount,
      )

      await checkCollateralAndDebtValues(redemptionTx, redemptionAmount, price)
    })

    it("pays any interest owed before principal", async () => {
      await setInterestRate(contracts, council, 100)
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("200")

      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      await updateTroveSnapshot(contracts, alice, "before")
      await performRedemption(contracts, dennis, alice, redemptionAmount)
      await updateTroveSnapshot(contracts, alice, "after")

      const interestAccrued = calculateInterestOwed(
        alice.trove.debt.before,
        100,
        alice.trove.lastInterestUpdateTime.before,
        alice.trove.lastInterestUpdateTime.after,
      )

      expect(interestAccrued).to.be.greaterThan(0n)
      expect(alice.trove.interestOwed.after).to.equal(0n)
      expect(alice.trove.debt.after).to.equal(
        alice.trove.debt.before - redemptionAmount + interestAccrued,
      )
    })

    it("correctly updates system interest rate and principal data for a partial redemption", async () => {
      await setInterestRate(contracts, council, 1000)
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("200")

      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      await updateTroveSnapshot(contracts, alice, "before")
      await updateInterestRateDataSnapshot(contracts, state, 1000, "before")

      await performRedemption(contracts, dennis, alice, redemptionAmount)

      await updateTroveSnapshot(contracts, alice, "after")
      await updateInterestRateDataSnapshot(contracts, state, 1000, "after")

      const now = BigInt(await getLatestBlockTimestamp())
      const beforeRedemptionInterest = [alice, bob, carol, dennis].reduce(
        (acc, user) =>
          calculateInterestOwed(
            user.trove.debt.before,
            1000,
            user.trove.lastInterestUpdateTime.before,
            now,
          ) + acc,
        0n,
      )

      const interestAccrued = calculateInterestOwed(
        alice.trove.debt.before,
        1000,
        alice.trove.lastInterestUpdateTime.before,
        alice.trove.lastInterestUpdateTime.after,
      )

      // interest adjustment is the minimum of interest accrued and redemption amount
      const interestAdjustment =
        interestAccrued < redemptionAmount ? interestAccrued : redemptionAmount
      const principalAdjustment = redemptionAmount - interestAdjustment

      expect(
        state.interestRateManager.interestRateData[1000].interest.after,
      ).to.equal(beforeRedemptionInterest - interestAdjustment)
      expect(
        state.interestRateManager.interestRateData[1000].principal.after,
      ).to.equal(
        state.interestRateManager.interestRateData[1000].principal.before -
          principalAdjustment,
      )
    })

    it("correctly updates system interest rate and principal data for a full redemption", async () => {
      const interestRate = 1000
      await setInterestRate(contracts, council, interestRate)
      await setupRedemptionTroves()

      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      // stop interest from accruing to make calculations easier
      await setInterestRate(contracts, council, 0)
      await contracts.borrowerOperations
        .connect(alice.wallet)
        .refinance(to1e18(1))

      await updateTroveSnapshot(contracts, alice, "before")
      await updateInterestRateDataSnapshot(
        contracts,
        state,
        interestRate,
        "before",
      )

      // subtract 200 mUSD from Alice's debt for gas compensation
      const redemptionAmount =
        (await contracts.troveManager.getTroveDebt(alice.address)) -
        to1e18("200")
      await performRedemption(contracts, dennis, alice, redemptionAmount)

      await updateTroveSnapshot(contracts, alice, "after")
      await updateInterestRateDataSnapshot(contracts, state, 0, "after")

      expect(
        state.interestRateManager.interestRateData[0].interest.after,
      ).to.equal(0)
      expect(
        state.interestRateManager.interestRateData[0].principal.after,
      ).to.equal(0)
    })

    it("correctly updates system interest rate and principal data for a mix of full and partial redemptions", async () => {
      const interestRate = 1000
      await setInterestRate(contracts, council, interestRate)
      await setupRedemptionTroves()

      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      // stop interest from accruing to make calculations easier
      await setInterestRate(contracts, council, 0)

      await contracts.borrowerOperations
        .connect(alice.wallet)
        .refinance(to1e18(1))
      await updateTroveSnapshot(contracts, alice, "before")

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .refinance(to1e18(1))
      await updateTroveSnapshot(contracts, bob, "before")

      await updateInterestRateDataSnapshot(
        contracts,
        state,
        interestRate,
        "before",
      )

      const redemptionAmount =
        (await contracts.troveManager.getTroveDebt(alice.address)) +
        to1e18("400")
      await performRedemption(contracts, dennis, alice, redemptionAmount)

      await updateTroveSnapshots(contracts, [alice, bob], "after")
      await updateInterestRateDataSnapshot(contracts, state, 0, "after")

      expect(
        state.interestRateManager.interestRateData[0].interest.after,
      ).to.equal(bob.trove.interestOwed.after)
      expect(
        state.interestRateManager.interestRateData[0].principal.after,
      ).to.equal(bob.trove.debt.after)
    })

    it("has the same functionality with invalid first hint, zero address", async () => {
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("200")
      const price = await contracts.priceFeed.fetchPrice()

      const redemptionTx = await performRedemption(
        contracts,
        dennis,
        dennis,
        redemptionAmount,
      )

      await checkCollateralAndDebtValues(redemptionTx, redemptionAmount, price)
    })

    it("has the same functionality with invalid first hint, non-existent trove", async () => {
      await setupRedemptionTroves()

      const redemptionAmount = to1e18("200")
      const price = await contracts.priceFeed.fetchPrice()

      const {
        partialRedemptionHintNICR,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
      } = await getRedemptionHints(contracts, dennis, redemptionAmount, price)

      const redemptionTx = await contracts.troveManager
        .connect(dennis.wallet)
        .redeemCollateral(
          redemptionAmount,
          eric.address, // Invalid first hint
          upperPartialRedemptionHint,
          lowerPartialRedemptionHint,
          partialRedemptionHintNICR,
          0,
          to1e18("1"),
          NO_GAS,
        )

      await checkCollateralAndDebtValues(redemptionTx, redemptionAmount, price)
    })

    it("has the same functionality with invalid first hint, trove below MCR", async () => {
      await setupRedemptionTroves()

      // Increase the price to start Eric
      const price = await contracts.priceFeed.fetchPrice()
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice(price * 2n)
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "200",
        sender: eric.wallet,
      })

      // Drop the price back to the initial price to put Eric below MCR
      await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)

      const redemptionAmount = to1e18("200")

      const {
        partialRedemptionHintNICR,
        upperPartialRedemptionHint,
        lowerPartialRedemptionHint,
      } = await getRedemptionHints(contracts, dennis, redemptionAmount, price)

      const redemptionTx = await contracts.troveManager
        .connect(dennis.wallet)
        .redeemCollateral(
          redemptionAmount,
          eric.address, // Invalid first hint, eric is below mcr
          upperPartialRedemptionHint,
          lowerPartialRedemptionHint,
          partialRedemptionHintNICR,
          0,
          to1e18("1"),
          NO_GAS,
        )

      await checkCollateralAndDebtValues(redemptionTx, redemptionAmount, price)
    })

    it("caller can redeem their entire mUSD balance", async () => {
      await setupRedemptionTroves()
      await updateWalletSnapshot(contracts, dennis, "before")

      await performRedemption(contracts, dennis, dennis, dennis.musd.before)

      await updateWalletSnapshot(contracts, dennis, "after")
      expect(dennis.musd.after).to.equal(0n)
    })

    it("a redemption that closes a trove leaves the trove's collateral surplus (collateral - collateral drawn) available for the trove owner to claim", async () => {
      await setupRedemptionTroves()

      await updateTroveSnapshot(contracts, alice, "before")
      await updateWalletSnapshot(contracts, alice, "before")

      // Fully redeem Alice's trove
      const redemptionAmount = to1e18("2010")
      await performRedemption(contracts, dennis, dennis, redemptionAmount)

      // Alice claims collateral surplus
      await contracts.borrowerOperations
        .connect(alice.wallet)
        .claimCollateral({ gasPrice: 0 })

      await updateWalletSnapshot(contracts, alice, "after")

      // Alice's collateral surplus should be equal to the difference between the collateral needed to cancel her debt and her total collateral
      const price = await contracts.priceFeed.fetchPrice()
      const collNeeded = to1e18(redemptionAmount) / price

      expect(
        alice.btc.before + alice.trove.collateral.before - alice.btc.after,
      ).to.be.closeTo(collNeeded, 1000n)
    })

    it("a redemption that closes a trove leaves the trove's collateral surplus available for the trove owner after re-opening trove", async () => {
      await setupRedemptionTroves()

      // Fully redeem Alice's trove
      const redemptionAmount = to1e18("2010")

      await updateTroveSnapshot(contracts, alice, "before")
      const price = await contracts.priceFeed.fetchPrice()
      const collNeeded = to1e18(redemptionAmount) / price
      const collateralSurplus = alice.trove.collateral.before - collNeeded
      await performRedemption(contracts, dennis, dennis, redemptionAmount)

      // Open a new trove
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: alice.wallet,
      })

      await updateWalletSnapshot(contracts, alice, "before")

      // Claim collateral surplus
      await contracts.borrowerOperations
        .connect(alice.wallet)
        .claimCollateral({ gasPrice: 0 })

      // Check that Alice's balance after is equal to her balance before claiming collateral plus the calculated surplus
      await updateWalletSnapshot(contracts, alice, "after")
      expect(alice.btc.after).to.equal(alice.btc.before + collateralSurplus)
    })

    it("succeeds if fee is less than max fee percentage", async () => {
      // Open identical troves for everyone but Dennis
      const users = [alice, bob, carol, dennis]
      await Promise.all(
        users.slice(0, -1).map((user) =>
          openTrove(contracts, {
            musdAmount: "20000",
            ICR: "200",
            sender: user.wallet,
          }),
        ),
      )

      // Open a trove for Dennis with slightly lower ICR
      await openTrove(contracts, {
        musdAmount: "40000",
        ICR: "195",
        sender: dennis.wallet,
      })

      // Calculate the fee for redeeming 1/10 of the total supply
      const totalSupply = await contracts.musd.totalSupply()
      const attemptedRedemptionAmount = totalSupply / 10n
      const price = await contracts.priceFeed.fetchPrice()
      const collNeeded = to1e18(attemptedRedemptionAmount) / price
      const fee =
        await contracts.troveManager.getRedemptionFeeWithDecay(collNeeded)
      const baseRate = await contracts.troveManager.baseRate()
      const feePercentage = (to1e18(fee) / collNeeded) * 1000n + baseRate
      const feePercentageNumber = Number(feePercentage) / Number(1e18)

      // Attempt to redeem with a fee 1% more than the calculated fee
      const redemptionTx = await redeemWithFee(
        feePercentageNumber + 1,
        attemptedRedemptionAmount,
      )
      const receipt = await redemptionTx.wait()

      // Check that the redemption succeeded
      expect(receipt?.status).to.equal(1)
    })

    it("a redemption made when base rate is zero increases the base rate", async () => {
      await setupRedemptionTroves()

      await setBaseRate(contracts, to1e18("0"))

      await performRedemption(contracts, dennis, dennis, to1e18("100"))

      expect(await contracts.troveManager.baseRate()).to.be.gt(0)
    })

    it("a redemption made when base rate is non-zero increases the base rate, for negligible time passed", async () => {
      await setupRedemptionTroves()

      const initialBaseRate = to1e18("0.1")
      await setBaseRate(contracts, initialBaseRate)

      await performRedemption(contracts, dennis, dennis, to1e18("100"))

      expect(await contracts.troveManager.baseRate()).to.be.gt(initialBaseRate)
    })

    it("lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
      await setupRedemptionTroves()

      const initialBaseRate = to1e18("0.1")
      await setBaseRate(contracts, initialBaseRate)

      await performRedemption(contracts, dennis, dennis, to1e18("100"))

      const lastFeeOpTime = await contracts.troveManager.lastFeeOperationTime()
      await fastForwardTime(45)
      await performRedemption(contracts, dennis, dennis, to1e18("100"))

      expect(await contracts.troveManager.lastFeeOperationTime()).to.equal(
        lastFeeOpTime,
      )
    })

    it("a redemption made at zero base rate sends a non-zero CollateralFee to PCV contract", async () => {
      await setBaseRate(contracts, to1e18("0"))

      await setupRedemptionTroves()

      await performRedemption(contracts, dennis, dennis, to1e18("100"))
      await updatePCVSnapshot(contracts, state, "after")

      expect(state.pcv.collateral.after).to.be.greaterThan(0n)
    })

    it("a redemption made at non-zero base rate sends a non-zero CollateralFee to PCV contract", async () => {
      await setBaseRate(contracts, to1e18("0.1"))

      await setupRedemptionTroves()

      await performRedemption(contracts, dennis, dennis, to1e18("100"))
      await updatePCVSnapshot(contracts, state, "after")

      expect(state.pcv.collateral.after).to.be.greaterThan(0n)
    })

    it("a redemption made at zero base increases the collateral-fees in PCV contract", async () => {
      await setBaseRate(contracts, to1e18("0"))

      await setupRedemptionTroves()
      await updatePCVSnapshot(contracts, state, "before")

      await performRedemption(contracts, dennis, dennis, to1e18("100"))
      await updatePCVSnapshot(contracts, state, "after")

      expect(state.pcv.collateral.after).to.be.greaterThan(
        state.pcv.collateral.before,
      )
    })

    it("a redemption sends the collateral remainder (CollateralDrawn - CollateralFee) to the redeemer", async () => {
      await setupRedemptionTroves()

      await updateWalletSnapshot(contracts, dennis, "before")
      const redemptionAmount = to1e18("100")
      const redemptionTx = await performRedemption(
        contracts,
        dennis,
        dennis,
        redemptionAmount,
      )

      const { collateralSent, collateralFee } =
        await getEmittedRedemptionValues(redemptionTx)

      const remainder = collateralSent - collateralFee

      await updateWalletSnapshot(contracts, dennis, "after")
      expect(dennis.btc.after - dennis.btc.before).to.equal(remainder)
    })

    it("doesn't affect the Stability Pool deposits or collateral gain of redeemed-from troves", async () => {
      await setupRedemptionTroves()

      // Deposit to stability pool
      await provideToSP(contracts, bob, to1e18("1000"))

      // Liquidate Alice
      await dropPriceAndLiquidate(contracts, deployer, alice)
      await updateStabilityPoolUserSnapshot(contracts, bob, "before")

      // Redeem collateral from Bob's trove
      await performRedemption(contracts, dennis, dennis, to1e18("100"))

      // Check that the Stability Pool deposits and collateral gain are unchanged
      await updateStabilityPoolUserSnapshot(contracts, bob, "after")
      expect(bob.stabilityPool.collateralGain.after).to.equal(
        bob.stabilityPool.collateralGain.before,
      )
      expect(bob.stabilityPool.compoundedDeposit.after).to.equal(
        bob.stabilityPool.compoundedDeposit.before,
      )
    })

    it("value of issued collateral == face value of redeemed mUSD (assuming 1 mUSD has value of $1)", async () => {
      await setupRedemptionTroves()

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      const redemptionAmount = to1e18("100")
      await performRedemption(contracts, dennis, dennis, redemptionAmount)

      const price = await contracts.priceFeed.fetchPrice()
      const collNeeded = to1e18(redemptionAmount) / price

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(
        state.activePool.collateral.before - state.activePool.collateral.after,
      ).to.equal(collNeeded)
    })

    it("updates the default pool's interest", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "200",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "300",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: carol.wallet,
      })

      // Open another trove for Dennis with a very high ICR
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "4000",
        sender: dennis.wallet,
      })

      await updateTroveSnapshot(contracts, alice, "before")

      await dropPriceAndLiquidate(contracts, deployer, alice)

      const interestRate = 1000
      await setInterestRate(contracts, council, interestRate)
      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "before",
        addresses,
      )

      const startTime = BigInt(await getLatestBlockTimestamp())

      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      const redemptionAmount = to1e18("100")

      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "before",
        addresses,
      )
      await updateTroveSnapshot(contracts, bob, "before")
      await updatePendingSnapshot(contracts, bob, "before")

      await performRedemption(contracts, dennis, bob, redemptionAmount)

      await updateTroveSnapshot(contracts, bob, "after")
      await updatePendingSnapshot(contracts, bob, "after")

      const endTime = BigInt(await getLatestBlockTimestamp())

      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "after",
        addresses,
      )

      expect(state.defaultPool.interest.after).to.be.closeTo(
        state.defaultPool.interest.before +
          calculateInterestOwed(
            alice.trove.debt.before,
            interestRate,
            startTime,
            endTime,
          ) -
          calculateInterestOwed(
            bob.pending.principal.before,
            interestRate,
            startTime,
            endTime,
          ),
        100n,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when TCR < MCR", async () => {
        const users = [alice, bob, carol, dennis]
        await Promise.all(
          users.slice(0, -1).map((user) =>
            openTrove(contracts, {
              musdAmount: "2000",
              ICR: "200",
              sender: user.wallet,
            }),
          ),
        )
        await openTrove(contracts, {
          musdAmount: "2000",
          ICR: "195",
          sender: dennis.wallet,
        })

        // Drop price to put Alice, Bob, and Carol at 110% ICR and Dennis just below
        await dropPrice(contracts, deployer, carol, to1e18("110"))
        expect(await getTCR(contracts)).to.be.lessThan(
          await contracts.troveManager.MCR(),
        )

        await expect(
          performRedemption(contracts, dennis, dennis, to1e18("1000")),
        ).to.be.revertedWith("TroveManager: Cannot redeem when TCR < MCR")
      })

      it("reverts when argument _amount is 0", async () => {
        await setupRedemptionTroves()

        await expect(
          performRedemption(contracts, dennis, dennis, 0n),
        ).to.be.revertedWith("TroveManager: Amount must be greater than zero")
      })

      it("reverts if max fee > 100%", async () => {
        await setupRedemptionTroves()

        await expect(redeemWithFee(101)).to.be.revertedWith(
          "Max fee percentage must be between 0.5% and 100%",
        )
      })

      it("reverts if max fee < 0.5%", async () => {
        await setupRedemptionTroves()

        await expect(redeemWithFee(0.49)).to.be.revertedWith(
          "Max fee percentage must be between 0.5% and 100%",
        )
      })

      it("reverts if fee exceeds max fee percentage", async () => {
        // Open identical troves for everyone but Dennis
        const users = [alice, bob, carol, dennis]
        await Promise.all(
          users.slice(0, -1).map((user) =>
            openTrove(contracts, {
              musdAmount: "20000",
              ICR: "200",
              sender: user.wallet,
            }),
          ),
        )

        // Open a trove for Dennis with slightly lower ICR
        await openTrove(contracts, {
          musdAmount: "40000",
          ICR: "195",
          sender: dennis.wallet,
        })

        // Calculate the fee for redeeming 1/10 of the total supply
        const totalSupply = await contracts.musd.totalSupply()
        const attemptedRedemptionAmount = totalSupply / 10n
        const price = await contracts.priceFeed.fetchPrice()
        const collNeeded = to1e18(attemptedRedemptionAmount) / price
        const fee =
          await contracts.troveManager.getRedemptionFeeWithDecay(collNeeded)
        const feePercentage = (to1e18(fee) / collNeeded) * 1000n

        // Convert the fee to a number to make it easier to work with
        const feePercentageNumber = Number(feePercentage) / Number(1e18)

        // Attempt to redeem with a maximum fee just slightly less than the calculated fee
        await expect(
          redeemWithFee(feePercentageNumber - 0.01, attemptedRedemptionAmount),
        ).to.be.revertedWith("Fee exceeded provided maximum")
      })

      it("reverts when requested redemption amount exceeds caller's mUSD token balance", async () => {
        await setupRedemptionTroves()
        await updateWalletSnapshot(contracts, dennis, "before")

        await expect(
          performRedemption(contracts, dennis, dennis, dennis.musd.before + 1n),
        ).to.be.revertedWith(
          "TroveManager: Requested redemption amount must be <= user's mUSD token balance",
        )
      })

      it("reverts if caller tries to redeem more than the outstanding system debt", async () => {
        await setupRedemptionTroves()

        const totalDebt = await contracts.troveManager.getEntireSystemDebt()
        const redemptionAmount = totalDebt + to1e18("100")
        await contracts.musd.unprotectedMint(bob.address, redemptionAmount)

        await expect(
          performRedemption(contracts, bob, alice, redemptionAmount),
        ).to.be.revertedWith("TroveManager: Only one trove in the system")
      })

      it("reverts if fee eats up all returned collateral", async () => {
        await setupRedemptionTroves()
        await updateTroveSnapshot(contracts, alice, "before")

        // Set base rate to 100%
        await setBaseRate(contracts, to1e18("1"))

        // Attempt to fully redeem Alice's trove
        await expect(
          performRedemption(contracts, dennis, dennis, alice.trove.debt.before),
        ).to.be.revertedWith(
          "TroveManager: Fee would eat up all returned collateral",
        )
      })
    })

    context("Emitted Events", () => {
      it("emits correct debt and coll values in each redeemed trove's TroveUpdated event", async () => {
        await setupRedemptionTroves()
        await updateTroveSnapshot(contracts, bob, "before")

        const partialAmount = to1e18("10")
        const redemptionAmount = to1e18("2010") + partialAmount // Redeem an amount equal to Alice's net debt + 10 mUSD

        // Perform a redemption that fully redeems Alice's trove and partially redeems Bob's
        const redemptionTx = await performRedemption(
          contracts,
          dennis,
          dennis,
          redemptionAmount,
        )

        const price = await contracts.priceFeed.fetchPrice()
        const collNeeded = to1e18(partialAmount) / price

        const troveUpdatedEvents = await getAllEventsByName(
          redemptionTx,
          TROVE_UPDATED_ABI,
          "TroveUpdated",
        )
        const { principal: aliceDebt, coll: aliceColl } =
          await getDebtAndCollFromTroveUpdatedEvents(troveUpdatedEvents, alice)
        const { principal: bobDebt, coll: bobColl } =
          await getDebtAndCollFromTroveUpdatedEvents(troveUpdatedEvents, bob)

        // Check that Alice's TroveUpdated event has 0 emitted debt and coll since it was closed
        expect(aliceDebt).to.equal(0n)
        expect(aliceColl).to.equal(0n)

        // Check that Bob's TroveUpdated event has the correct emitted debt and coll values
        expect(bobDebt).to.equal(bob.trove.debt.before - partialAmount)
        expect(bobColl).to.equal(bob.trove.collateral.before - collNeeded)
      })
    })
  })

  describe("getEntireDebtAndColl()", () => {
    it("reflects accrued interest", async () => {
      await setInterestRate(contracts, council, 100)
      const { totalDebt } = await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: carol.wallet,
      })
      await updateTroveSnapshot(contracts, carol, "before")
      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      await updateTroveSnapshot(contracts, carol, "after")
      await contracts.troveManager.updateSystemAndTroveInterest(carol.wallet)
      const currentTime = BigInt(await getLatestBlockTimestamp())
      const entireDebt = await getTroveEntireDebt(contracts, carol.wallet)

      expect(entireDebt).to.equal(
        totalDebt +
          calculateInterestOwed(
            totalDebt,
            100,
            carol.trove.lastInterestUpdateTime.before,
            currentTime,
          ),
      )
    })
  })

  describe("getPendingMUSDDebtReward()", () => {
    it("returns 0 if there is no pending mUSD reward", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: carol.wallet,
      })
      await provideToSP(contracts, bob, to1e18("10000"))

      await dropPriceAndLiquidate(contracts, deployer, carol)
      await updatePendingSnapshot(contracts, alice, "after")
      expect(alice.pending.principal.after).to.equal(0n)
    })
  })

  describe("getPendingCollateralReward()", () => {
    it("returns 0 if there is no pending collateral reward", async () => {
      await setupTroves()
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: carol.wallet,
      })
      await provideToSP(contracts, bob, to1e18("10000"))

      await dropPriceAndLiquidate(contracts, deployer, carol)
      await updatePendingSnapshot(contracts, alice, "after")
      expect(alice.pending.collateral.after).to.equal(0n)
    })
  })

  describe("computeICR()", () => {
    it("Returns 0 if trove's coll is worth 0", async () => {
      const price = 0
      const coll = 1
      const debt = to1e18("100")
      expect(
        await contracts.troveManager.computeICR(coll, debt, price),
      ).to.equal(0)
    })

    it("returns correct ICR for a given collateral, debt, and price", async () => {
      const price = to1e18("100")
      const coll = to1e18("200")
      const debt = to1e18("30")
      const expectedICR = (coll * price) / debt

      expect(
        await contracts.troveManager.computeICR(coll, debt, price),
      ).to.equal(expectedICR)
    })

    it("returns 2^256-1 for non-zero coll and zero debt", async () => {
      const price = to1e18("100")
      const coll = to1e18("200")
      const debt = 0n
      expect(
        await contracts.troveManager.computeICR(coll, debt, price),
      ).to.equal(2n ** 256n - 1n)
    })
  })

  describe("checkRecoveryMode()", () => {
    it("Returns true when TCR < 150%", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "200",
        sender: alice.wallet,
      })
      await dropPrice(contracts, deployer, alice)

      expect(
        await contracts.troveManager.checkRecoveryMode(
          await contracts.priceFeed.fetchPrice(),
        ),
      ).to.equal(true)
    })

    it("Returns false when TCR == 150%", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "150",
        sender: alice.wallet,
      })

      expect(
        await contracts.troveManager.checkRecoveryMode(
          await contracts.priceFeed.fetchPrice(),
        ),
      ).to.equal(false)
    })

    it("Returns false when TCR > 150%", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "151",
        sender: alice.wallet,
      })

      expect(
        await contracts.troveManager.checkRecoveryMode(
          await contracts.priceFeed.fetchPrice(),
        ),
      ).to.equal(false)
    })

    it("Returns true when TCR == 0", async () => {
      // Note that the original implementation had this (incorrectly) returning false
      // THUSD Test: https://github.com/Threshold-USD/dev/blob/develop/packages/contracts/test/TroveManagerTest.js#L4144
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "150",
        sender: alice.wallet,
      })

      await contracts.mockAggregator.connect(deployer.wallet).setPrice(0)

      expect(
        await contracts.troveManager.checkRecoveryMode(
          await contracts.priceFeed.fetchPrice(),
        ),
      ).to.equal(true)
    })
  })

  describe("setMaxInterestRate()", () => {
    it("sets the max interest rate", async () => {
      await contracts.interestRateManager
        .connect(council.wallet)
        .setMaxInterestRate(5)
      expect(await contracts.interestRateManager.maxInterestRate()).to.equal(5)
    })

    context("Expected Reverts", () => {
      it("reverts if a non-whitelisted address tries to set the maximum interest rate", async () => {
        await expect(
          contracts.interestRateManager
            .connect(alice.wallet)
            .setMaxInterestRate(1),
        ).to.be.revertedWith(
          "InterestRateManager: Only governance can call this function",
        )
      })
    })

    context("Emitted Events", () => {
      it("emits MaxInterestRateUpdated when the maximum interest rate is updated", async () => {
        await expect(
          contracts.interestRateManager
            .connect(council.wallet)
            .setMaxInterestRate(50),
        )
          .to.emit(contracts.interestRateManager, "MaxInterestRateUpdated")
          .withArgs(50)
      })
    })
  })

  describe("proposeInterestRate()", () => {
    context("Expected Reverts", () => {
      it("reverts if the proposed rate exceeds the maximum interest rate", async () => {
        await expect(
          contracts.interestRateManager
            .connect(council.wallet)
            .proposeInterestRate(10001),
        ).to.be.revertedWith("Interest rate exceeds the maximum interest rate")
      })
    })
  })

  describe("approveInterestRate()", () => {
    it("requires two transactions to change the interest rate with a 7 day time delay", async () => {
      await contracts.interestRateManager
        .connect(council.wallet)
        .proposeInterestRate(100)

      // Simulate 7 days passing
      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.interestRateManager
        .connect(council.wallet)
        .approveInterestRate()
      expect(await contracts.interestRateManager.interestRate()).to.equal(100)
    })

    context("Expected Reverts", () => {
      it("reverts if the time delay has not finished", async () => {
        await contracts.interestRateManager
          .connect(council.wallet)
          .proposeInterestRate(100)

        // Simulate 6 days passing
        const timeToIncrease = 6 * 24 * 60 * 60 // 6 days in seconds
        await fastForwardTime(timeToIncrease)

        await expect(
          contracts.interestRateManager
            .connect(council.wallet)
            .approveInterestRate(),
        ).to.be.revertedWith("Proposal delay not met")
      })

      it("reverts if called by a non-governance address", async () => {
        await contracts.interestRateManager
          .connect(council.wallet)
          .proposeInterestRate(100)

        // Simulate 6 days passing
        const timeToIncrease = 6 * 24 * 60 * 60 // 6 days in seconds
        await fastForwardTime(timeToIncrease)

        await expect(
          contracts.interestRateManager
            .connect(alice.wallet)
            .approveInterestRate(),
        ).to.be.revertedWith(
          "InterestRateManager: Only governance can call this function",
        )
      })
    })

    it("updates the default pool's accrued interest", async () => {
      const interestRate = 100
      await setInterestRate(contracts, council, interestRate)

      await openTrove(contracts, {
        musdAmount: "8000",
        ICR: "500",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: bob.wallet,
      })

      await updateTroveSnapshots(contracts, [alice, bob], "before")

      await dropPriceAndLiquidate(contracts, deployer, bob)

      // Fast-forward 1 year
      await fastForwardTime(365 * 24 * 60 * 60)

      await setInterestRate(contracts, council, 200)

      const endTime = BigInt(await getLatestBlockTimestamp())

      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "after",
        addresses,
      )

      expect(state.defaultPool.interest.after).to.be.closeTo(
        calculateInterestOwed(
          bob.trove.debt.before,
          interestRate,
          bob.trove.lastInterestUpdateTime.before,
          endTime,
        ),
        1000,
      )
    })
  })

  describe("calculateInterestOwed()", () => {
    it("should calculate the interest owed for a trove after 15 days", async () => {
      const interest =
        await contracts.interestRateManager.calculateInterestOwed(
          to1e18("10,250"),
          100n,
          0n,
          1296000n, // 15 days in seconds
        )

      const expectedInterest = calculateInterestOwed(
        to1e18("10,250"),
        100,
        0n,
        1296000n, // 15 days in seconds
      )
      expect(interest).to.be.equal(expectedInterest)
    })

    it("should calculate the interest owed for a trove after 30 days", async () => {
      await setupTroveWithInterestRate(100, 30)
      const interest =
        await contracts.interestRateManager.calculateInterestOwed(
          to1e18("10,250"),
          100n,
          0n,
          2592000n, // 30 days in seconds
        )

      const expectedInterest = calculateInterestOwed(
        to1e18("10,250"),
        100,
        0n,
        2592000n, // 15 days in seconds
      )

      expect(interest).to.be.equal(expectedInterest)
    })
  })

  describe("updateSystemAndTroveInterest()", async () => {
    it("should mint additional calculated interest to the PCV", async () => {
      await setupTroveWithInterestRate(1000, 365)

      await updateInterestRateDataSnapshot(contracts, state, 1000, "before")
      await updatePCVSnapshot(contracts, state, "before")

      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 1000, "after")
      await updatePCVSnapshot(contracts, state, "after")

      expect(state.pcv.musd.after - state.pcv.musd.before).to.equal(
        state.interestRateManager.interestRateData[1000].interest.after,
      )
    })

    it("should update the trove with interest owed and set the lastInterestUpdatedTime", async () => {
      await setupTroveWithInterestRate(100, 30)

      await updateTroveSnapshot(contracts, alice, "before")

      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateTroveSnapshot(contracts, alice, "after")

      expect(alice.trove.debt.after).to.equal(alice.trove.debt.before)

      const interestOwed = calculateInterestOwed(
        to1e18("10,250"),
        100,
        alice.trove.lastInterestUpdateTime.before,
        BigInt(await getLatestBlockTimestamp()),
      )

      expect(alice.trove.interestOwed.after).to.equal(
        alice.trove.interestOwed.before + interestOwed,
      )
      expect(alice.trove.lastInterestUpdateTime.after).to.equal(
        await getLatestBlockTimestamp(),
      )
    })

    it("should add new interest to existing interest on a trove", async () => {
      await setInterestRate(contracts, council, 100)

      await openTrove(contracts, {
        musdAmount: "10,000",
        sender: alice.wallet,
      })
      await updateTroveSnapshot(contracts, alice, "before")

      const daysInSeconds = 30 * 24 * 60 * 60
      await fastForwardTime(daysInSeconds)

      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await fastForwardTime(daysInSeconds)
      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)
      await updateTroveSnapshot(contracts, alice, "after")

      const expectedInterest = calculateInterestOwed(
        to1e18("10,250"),
        100,
        alice.trove.lastInterestUpdateTime.before,
        alice.trove.lastInterestUpdateTime.after,
      )

      expect(alice.trove.interestOwed.after).to.be.equal(
        alice.trove.interestOwed.before + expectedInterest,
      )
    })

    it("should update the system interest", async () => {
      await setupTroveWithInterestRate(100, 30)
      await updateInterestRateDataSnapshot(contracts, state, 100, "before")

      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 100, "after")

      expect(
        state.interestRateManager.interestRateData[100].interest.after,
      ).to.equal(
        calculateInterestOwed(
          to1e18(10250),
          100,
          state.interestRateManager.interestRateData[100].lastUpdatedTime
            .before,
          BigInt(await getLatestBlockTimestamp()),
        ),
      )
    })

    it("should update the system interest after a previous update", async () => {
      await setupTroveWithInterestRate(100, 30)
      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 100, "before")

      await fastForwardTime(30 * 24 * 60 * 60)
      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 100, "after")

      expect(
        state.interestRateManager.interestRateData[100].interest.after,
      ).to.equal(
        state.interestRateManager.interestRateData[100].interest.before +
          calculateInterestOwed(
            to1e18(10250),
            100,
            state.interestRateManager.interestRateData[100].lastUpdatedTime
              .before,
            state.interestRateManager.interestRateData[100].lastUpdatedTime
              .after,
          ),
      )
    })

    it("should update the system interest with multiple troves", async () => {
      await setupTroveWithInterestRate(100, 30)

      await openTrove(contracts, {
        sender: bob.wallet,
        musdAmount: "20,000",
      })

      await updateInterestRateDataSnapshot(contracts, state, 100, "before")
      await updateTroveSnapshots(contracts, [alice, bob], "before")

      await fastForwardTime(30 * 24 * 60 * 60)
      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 100, "after")
      await updateTroveSnapshots(contracts, [alice, bob], "after")

      expect(
        state.interestRateManager.interestRateData[100].interest.after,
      ).to.equal(
        state.interestRateManager.interestRateData[100].interest.before +
          calculateInterestOwed(
            alice.trove.debt.before + bob.trove.debt.before,
            100,
            state.interestRateManager.interestRateData[100].lastUpdatedTime
              .before,
            state.interestRateManager.interestRateData[100].lastUpdatedTime
              .after,
          ),
      )
    })

    it("should update the system interest with multiple interest rates", async () => {
      await setupTroveWithInterestRate(100, 30)

      await setInterestRate(contracts, council, 200)
      await openTrove(contracts, {
        sender: bob.wallet,
        musdAmount: "20,000",
      })

      await updateInterestRateDataSnapshot(contracts, state, 200, "before")
      await updateTroveSnapshots(contracts, [alice, bob], "before")

      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 100, "before")

      await fastForwardTime(30 * 24 * 60 * 60)
      await contracts.troveManager.updateSystemAndTroveInterest(alice.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 100, "after")

      await contracts.troveManager.updateSystemAndTroveInterest(bob.wallet)

      await updateInterestRateDataSnapshot(contracts, state, 200, "after")

      expect(
        state.interestRateManager.interestRateData[100].interest.after,
      ).to.equal(
        state.interestRateManager.interestRateData[100].interest.before +
          calculateInterestOwed(
            alice.trove.debt.before,
            100,
            state.interestRateManager.interestRateData[100].lastUpdatedTime
              .before,
            state.interestRateManager.interestRateData[100].lastUpdatedTime
              .after,
          ),
      )

      expect(
        state.interestRateManager.interestRateData[200].interest.after,
      ).to.equal(
        state.interestRateManager.interestRateData[200].interest.before +
          calculateInterestOwed(
            bob.trove.debt.before,
            200,
            state.interestRateManager.interestRateData[200].lastUpdatedTime
              .before,
            state.interestRateManager.interestRateData[200].lastUpdatedTime
              .after,
          ),
      )
    })
  })

  describe("Getters", () => {
    it("getTroveStake(): Returns stake", async () => {
      const { collateral } = await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "150",
        sender: alice.wallet,
      })

      expect(
        await contracts.troveManager.getTroveStake(alice.address),
      ).to.equal(collateral)
    })

    it("getTroveColl(): Returns coll", async () => {
      const { collateral } = await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "150",
        sender: alice.wallet,
      })

      expect(await contracts.troveManager.getTroveColl(alice.address)).to.equal(
        collateral,
      )
    })

    it("getTroveDebt(): Returns debt", async () => {
      const { totalDebt } = await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "150",
        sender: alice.wallet,
      })

      expect(await contracts.troveManager.getTroveDebt(alice.address)).to.equal(
        totalDebt,
      )
    })

    it("getTroveStatus(): Returns status", async () => {
      const { totalDebt } = await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "200",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "200",
        sender: bob.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "150",
        sender: carol.wallet,
      })

      // Close Alice's trove by repaying debt
      await transferMUSD(contracts, bob, alice, totalDebt)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      await dropPriceAndLiquidate(contracts, deployer, carol)

      // Alice's trove should be status 2 -- closed by user
      expect(await checkTroveStatus(contracts, alice, 2n, false)).to.equal(true)
      expect(await checkTroveActive(contracts, bob)).to.equal(true)
      expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(
        true,
      )
      expect(await checkTroveStatus(contracts, dennis, 0n, false)).to.equal(
        true,
      ) // No trove
    })

    it("hasPendingRewards(): Returns false if trove is not active", async () => {
      expect(
        await contracts.troveManager.hasPendingRewards(alice.address),
      ).to.equal(false)
    })
  })
})
