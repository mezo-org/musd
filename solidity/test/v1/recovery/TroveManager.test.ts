import { expect } from "chai"
import {
  applyLiquidationFee,
  checkTroveActive,
  checkTroveClosedByLiquidation,
  Contracts,
  ContractsState,
  dropPrice,
  dropPriceAndLiquidate,
  getEmittedLiquidationValues,
  getTroveEntireColl,
  NO_GAS,
  openTrove,
  provideToSP,
  setupTests,
  updatePendingSnapshot,
  updateStabilityPoolSnapshot,
  updateStabilityPoolUserSnapshots,
  updateTroveManagerSnapshot,
  updateTroveSnapshot,
  updateTroveSnapshots,
  updateWalletSnapshot,
  User,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("TroveManager in Recovery Mode", () => {
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let frank: User
  let state: ContractsState
  let contracts: Contracts

  beforeEach(async () => {
    ;({ alice, bob, carol, dennis, eric, frank, contracts, state } =
      await setupTests())
  })

  async function setupTrove(user: User, musdAmount: string, ICR: string) {
    return openTrove(contracts, {
      musdAmount,
      ICR,
      sender: user.wallet,
    })
  }

  async function setupTroveAndSnapshot(
    user: User,
    musdAmount: string,
    ICR: string,
  ) {
    const trove = await setupTrove(user, musdAmount, ICR)
    await updateTroveSnapshot(contracts, user, "before")
    return trove
  }

  async function setupTrovesForStabilityPoolTests() {
    const { totalDebt } = await setupTroveAndSnapshot(bob, "2000", "240")
    await setupTroveAndSnapshot(
      alice,
      ((totalDebt + to1e18("2000")) / to1e18("1")).toString(),
      "266",
    )
    await setupTroveAndSnapshot(dennis, "3800", "266")

    const spDeposit = totalDebt + to1e18("1")
    await provideToSP(contracts, alice, spDeposit)

    return { spDeposit, totalDebt }
  }

  async function setupTrovesStabilityPoolLessThanDebt() {
    const { totalDebt } = await setupTroveAndSnapshot(bob, "2050", "240")
    await setupTroveAndSnapshot(
      alice,
      ((totalDebt + to1e18("2000")) / to1e18("1")).toString(),
      "266",
    )
    await setupTroveAndSnapshot(dennis, "3800", "266")

    const spDeposit = totalDebt - to1e18("1")
    await provideToSP(contracts, alice, spDeposit)

    return { spDeposit, totalDebt }
  }

  async function checkRecoveryMode() {
    return contracts.troveManager.checkRecoveryMode(
      await contracts.priceFeed.fetchPrice(),
    )
  }

  describe("liquidateTroves()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("liquidateTroves(): reverts if n = 0", async () => {
        await setupTrove(alice, "5000", "150")
        await setupTrove(bob, "5000", "150")

        await dropPrice(contracts, alice, to1e18("100"))

        await expect(
          contracts.troveManager.liquidateTroves(0n),
        ).to.be.revertedWith("TroveManager: nothing to liquidate")
      })

      it("liquidateTroves(): does nothing if all troves have ICR > 110% and Stability Pool is empty", async () => {
        await setupTrove(alice, "5000", "200")
        await setupTrove(bob, "5000", "200")
        await expect(
          contracts.troveManager.liquidateTroves(2),
        ).to.be.revertedWith("TroveManager: nothing to liquidate")
      })
    })

    /**
     *
     * Emitted Events
     *
     */
    context("Emitted Events", () => {
      it("liquidateTroves(): emits liquidation event with correct values when all troves have ICR > 110% and Stability Pool covers a subset of troves", async () => {
        // Users to be absorbed by the SP
        await setupTroveAndSnapshot(alice, "2000", "200")
        await setupTroveAndSnapshot(bob, "2000", "200")

        // Users to be spared
        await setupTroveAndSnapshot(carol, "2000", "210")
        await setupTroveAndSnapshot(dennis, "20,000", "250")

        const spDeposit = alice.trove.debt.before + bob.trove.debt.before
        await provideToSP(contracts, dennis, spDeposit)

        const price = await dropPrice(contracts, dennis, to1e18("149"))

        const liquidationTx = await contracts.troveManager.liquidateTroves(4)
        const { liquidatedDebt, liquidatedColl } =
          await getEmittedLiquidationValues(liquidationTx)

        const expectedLiquidatedColl = applyLiquidationFee(
          ((alice.trove.debt.before + bob.trove.debt.before) * to1e18("1.1")) /
            price,
        )
        expect(liquidatedColl).to.be.closeTo(expectedLiquidatedColl, 100n)
        expect(liquidatedDebt).to.equal(
          alice.trove.debt.before + bob.trove.debt.before,
        )
      })
    })

    /**
     *
     * System State Changes
     *
     */
    context("System State Changes", () => {
      it("liquidateTroves(): a liquidation sequence containing Pool offsets increases the TCR", async () => {
        await setupTrove(alice, "5000", "150")
        await setupTrove(bob, "50,000", "400")
        await setupTrove(carol, "5000", "150")

        await provideToSP(contracts, bob, to1e18("10,000"))

        await dropPrice(contracts, alice)
        await updateTroveManagerSnapshot(contracts, state, "before")
        await contracts.troveManager.liquidateTroves(2)
        await updateTroveManagerSnapshot(contracts, state, "after")
        expect(state.troveManager.TCR.after).to.be.greaterThan(
          state.troveManager.TCR.before,
        )
      })

      it("liquidateTroves(): A liquidation sequence of pure redistributions decreases the TCR, due to gas compensation, but up to 0.5%", async () => {
        await setupTrove(alice, "5000", "400")
        await setupTrove(bob, "50,000", "5000")
        await setupTrove(carol, "2000", "400")
        await setupTrove(dennis, "2000", "400")

        // Drop the price to make everyone but Bob eligible for liquidation and snapshot the TCR
        await dropPrice(contracts, alice)
        await updateTroveManagerSnapshot(contracts, state, "before")

        // Perform liquidation and check that TCR has decreased
        await contracts.troveManager.liquidateTroves(4)
        await updateTroveManagerSnapshot(contracts, state, "after")
        expect(state.troveManager.TCR.before).to.be.greaterThan(
          state.troveManager.TCR.after,
        )

        // Check that the TCR has decreased by no more than the liquidation fee
        expect(state.troveManager.TCR.after).to.be.greaterThanOrEqual(
          applyLiquidationFee(state.troveManager.TCR.before),
        )
      })
    })

    /**
     *
     * Individual Troves
     *
     */
    context("Individual Troves", () => {
      it.skip("liquidateTroves(): With all ICRs > 110%, Liquidates Troves until system leaves recovery mode", async () => {
        // TODO This test involves a bit of algebra to determine the exact ICRs that will be achieved
        // Open 5 troves
        await setupTroveAndSnapshot(bob, "5000", "240")
        await setupTroveAndSnapshot(carol, "5000", "240")
        await setupTroveAndSnapshot(dennis, "5000", "230")
        await setupTroveAndSnapshot(eric, "5000", "240")
        await setupTroveAndSnapshot(frank, "5000", "240")

        // Open another trove for Eric that contains the total debt of the other troves plus min debt
        const liquidationAmount =
          bob.trove.debt.before +
          carol.trove.debt.before +
          dennis.trove.debt.before +
          eric.trove.debt.before +
          frank.trove.debt.before

        await openTrove(contracts, {
          musdAmount: liquidationAmount + to1e18("1800"),
          sender: alice.wallet,
          ICR: "400",
        })

        // Alice provides the total debt to the SP
        await provideToSP(contracts, alice, liquidationAmount)

        // Drop the price to put the system into recovery mode (TCR < 150%)
        await dropPrice(contracts, dennis, to1e18("111"))
        expect(await checkRecoveryMode()).to.equal(true)

        // Liquidate Troves until the system leaves recovery mode
        await contracts.troveManager.liquidateTroves(5n)

        // Check that we are no longer in recovery mode
        expect(await checkRecoveryMode()).to.equal(false)

        // Check status of troves
        expect(await checkTroveActive(contracts, alice)).to.equal(true)
      })

      it("liquidateTroves(): Liquidates Troves until 1) system has left recovery mode AND 2) it reaches a Trove with ICR >= 110%", async () => {
        // Open 5 troves
        await setupTroveAndSnapshot(bob, "5000", "240")
        await setupTroveAndSnapshot(carol, "5000", "240")
        await setupTroveAndSnapshot(dennis, "5000", "230")
        await setupTroveAndSnapshot(eric, "5000", "240")
        await setupTroveAndSnapshot(frank, "5000", "240")

        // Open another trove for Eric that contains the total debt of the other troves plus min debt
        const liquidationAmount =
          bob.trove.debt.before +
          carol.trove.debt.before +
          dennis.trove.debt.before +
          eric.trove.debt.before +
          frank.trove.debt.before

        await openTrove(contracts, {
          musdAmount: liquidationAmount + to1e18("1800"),
          sender: alice.wallet,
          ICR: "400",
        })

        // Alice provides the total debt to the SP
        await provideToSP(contracts, alice, liquidationAmount)

        // Drop the price to put the system into recovery mode (TCR < 150%)
        await dropPrice(contracts, dennis, to1e18("105"))
        expect(await checkRecoveryMode()).to.equal(true)
        await updateTroveSnapshots(
          contracts,
          [alice, bob, carol, dennis, eric, frank],
          "after",
        )

        // Liquidate Troves until the system leaves recovery mode
        await contracts.troveManager.liquidateTroves(6n)

        // Check that we are no longer in recovery mode
        expect(await checkRecoveryMode()).to.equal(false)

        // Alice should still be active, everyone else is closed by liquidation
        expect(await checkTroveActive(contracts, alice)).to.equal(true)
        expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, dennis)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, eric)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, frank)).to.equal(
          true,
        )
      })

      it("liquidateTroves(): liquidates only up to the requested number of undercollateralized troves", async () => {
        await setupTrove(alice, "5000", "150")
        await setupTrove(bob, "5000", "150")

        await dropPrice(contracts, alice, to1e18("100"))

        await contracts.troveManager.liquidateTroves(1n)

        expect(await checkTroveClosedByLiquidation(contracts, alice)).to.equal(
          true,
        )
        expect(await checkTroveActive(contracts, bob)).to.equal(true)
      })

      it("liquidateTroves(): closes every Trove with ICR < MCR, when n > number of undercollateralized troves", async () => {
        const underCollateralizedUsers = [alice, carol, dennis, eric]
        await Promise.all(
          underCollateralizedUsers.map((user) =>
            setupTrove(user, "5000", "150"),
          ),
        )
        await setupTrove(bob, "50,000", "200")

        await provideToSP(contracts, bob, to1e18("25,000"))
        await dropPrice(contracts, alice)

        await contracts.troveManager.liquidateTroves(5n)
        const closedByLiquidation = await Promise.all(
          underCollateralizedUsers.map((user) =>
            checkTroveClosedByLiquidation(contracts, user),
          ),
        )
        expect(closedByLiquidation.every(Boolean)).to.equal(true)

        expect(await checkTroveActive(contracts, bob)).to.equal(true)
      })

      it("liquidateTroves(): liquidates based on entire/collateral debt (including pending rewards), not raw collateral/debt", async () => {
        await setupTrove(alice, "2000", "400")
        await setupTrove(bob, "2000", "200.01")
        await setupTrove(carol, "2000", "200")
        await setupTrove(dennis, "2000", "200")

        // Drop the price so that Carol and Dennis are at risk for liquidation, but do not liquidate anyone yet
        const newPrice = await dropPrice(contracts, dennis)

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
        await contracts.troveManager.liquidateTroves(3)

        // Check that Alice stays active and Carol and Bob get liquidated
        expect(await checkTroveActive(contracts, alice)).to.equal(true)
        expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(
          true,
        )
      })

      it("liquidateTroves() with a non fulfilled liquidation: still can liquidate further troves after the non-liquidated, emptied pool", async () => {
        await setupTroveAndSnapshot(alice, "5000", "150")
        await setupTroveAndSnapshot(bob, "5000", "150")
        await setupTroveAndSnapshot(carol, "20,000", "180")
        await setupTroveAndSnapshot(dennis, "2000", "160")

        // Carol deposits enough to cover Alice and Dennis' debt
        const spDeposit = alice.trove.debt.before + dennis.trove.debt.before
        await provideToSP(contracts, carol, spDeposit)

        await dropPrice(contracts, alice, to1e18("115"))

        // Troves in ICR order: Alice, Bob, Dennis, Carol
        await contracts.troveManager.liquidateTroves(4)

        expect(await checkTroveClosedByLiquidation(contracts, alice)).to.equal(
          true,
        )
        // SP can cover Dennis' debt, so he gets liquidated even though he has a higher ICR than Bob
        expect(await checkTroveClosedByLiquidation(contracts, dennis)).to.equal(
          true,
        )
        expect(await checkTroveActive(contracts, bob)).to.equal(true)
        expect(await checkTroveActive(contracts, carol)).to.equal(true)
      })

      it("liquidateTroves() with a non fulfilled liquidation: non liquidated trove remains active", async () => {
        await setupTroveAndSnapshot(alice, "5000", "150")
        await setupTroveAndSnapshot(bob, "5000", "150")
        await setupTroveAndSnapshot(carol, "20,000", "160")

        // Carol deposits enough to cover Alice's debt and half of Bob's
        const spDeposit = alice.trove.debt.before + bob.trove.debt.before / 2n
        await provideToSP(contracts, carol, spDeposit)

        await dropPrice(contracts, alice, to1e18("115"))
        await contracts.troveManager.liquidateTroves(2)

        expect(await checkTroveClosedByLiquidation(contracts, alice)).to.equal(
          true,
        )
        // Bob should remain active because his trove was only partially liquidated
        expect(await checkTroveActive(contracts, bob)).to.equal(true)
        expect(await checkTroveActive(contracts, carol)).to.equal(true)
      })
    })

    /**
     *
     * Balance changes
     *
     */
    context("Balance changes", () => {
      it("liquidateTroves(): does not affect the liquidated user's token balances", async () => {
        await setupTrove(alice, "5000", "150")
        await setupTrove(bob, "5000", "150")
        await updateWalletSnapshot(contracts, alice, "before")
        await updateWalletSnapshot(contracts, bob, "before")

        await dropPrice(contracts, alice)
        await contracts.troveManager.liquidateTroves(2)
        await updateWalletSnapshot(contracts, alice, "after")
        await updateWalletSnapshot(contracts, bob, "after")

        // Balances should remain unchanged
        expect(alice.musd.after).to.equal(alice.musd.before + to1e18("200"))
        expect(bob.musd.after).to.equal(bob.musd.before)
      })

      it("liquidateTroves(): Liquidating troves at 100 < ICR < 110 with SP deposits correctly impacts their SP deposit and collateral gains", async () => {
        // Open three troves: Alice, Bob, Carol
        await setupTroveAndSnapshot(alice, "2000", "200")
        await setupTroveAndSnapshot(bob, "2000", "200")
        await setupTroveAndSnapshot(carol, "20,000", "210")

        // All deposit into the stability pool
        const aliceDeposit = to1e18("500")
        const bobDeposit = to1e18("1000")
        const carolDeposit = to1e18("3000")
        await provideToSP(contracts, alice, aliceDeposit)
        await provideToSP(contracts, bob, bobDeposit)
        await provideToSP(contracts, carol, carolDeposit)

        await updateStabilityPoolUserSnapshots(
          contracts,
          [alice, bob, carol],
          "before",
        )

        await dropPrice(contracts, alice, to1e18("105"))
        await contracts.troveManager.liquidateTroves(2)

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
        )
      })

      it("liquidateTroves(): Liquidating troves at ICR <=100% with SP deposits does not alter their deposit or collateral gain", async () => {
        // Open three troves: Alice, Bob, Carol
        await setupTroveAndSnapshot(alice, "2000", "200")
        await setupTroveAndSnapshot(bob, "2000", "200")
        await setupTroveAndSnapshot(carol, "20,000", "200")

        // All deposit into the stability pool
        const aliceDeposit = to1e18("500")
        const bobDeposit = to1e18("1000")
        const carolDeposit = to1e18("3000")
        await provideToSP(contracts, alice, aliceDeposit)
        await provideToSP(contracts, bob, bobDeposit)
        await provideToSP(contracts, carol, carolDeposit)

        await updateStabilityPoolUserSnapshots(
          contracts,
          [alice, bob, carol],
          "before",
        )

        await dropPrice(contracts, alice, to1e18("100"))
        await contracts.troveManager.liquidateTroves(3)

        // Check that each user's deposit has not changed
        await updateStabilityPoolUserSnapshots(
          contracts,
          [alice, bob, carol],
          "after",
        )

        expect(aliceDeposit).to.equal(
          alice.stabilityPool.compoundedDeposit.after,
        )
        expect(bobDeposit).to.equal(bob.stabilityPool.compoundedDeposit.after)
        expect(carolDeposit).to.equal(
          carol.stabilityPool.compoundedDeposit.after,
        )

        // Check that each user's collateral gain has not changed
        expect(0n).to.equal(alice.stabilityPool.collateralGain.after)
        expect(0n).to.equal(bob.stabilityPool.collateralGain.after)
        expect(0n).to.equal(carol.stabilityPool.collateralGain.after)
      })
    })

    /**
     *
     * Fees
     *
     */
    context("Fees", () => {})

    /**
     *
     * State change in other contracts
     *
     */
    context("State change in other contracts", () => {})
  })

  describe("checkRecoveryMode()", () => {
    it("checkRecoveryMode(): Returns true if TCR falls below CCR", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: alice.wallet,
      })

      const price = await dropPrice(contracts, alice)

      const recoveryMode = await contracts.troveManager.checkRecoveryMode(price)
      expect(recoveryMode).to.equal(true)
    })

    it("checkRecoveryMode(): returns false if TCR stays above CCR", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: alice.wallet,
      })

      const price = await contracts.priceFeed.fetchPrice()

      const recoveryMode = await contracts.troveManager.checkRecoveryMode(price)
      expect(recoveryMode).to.equal(false)
    })

    it("checkRecoveryMode(): returns false if TCR rises above CCR", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: alice.wallet,
      })

      const price = await contracts.priceFeed.fetchPrice()
      await dropPrice(contracts, alice)

      await contracts.mockAggregator.setPrice(price)
      const recoveryMode = await contracts.troveManager.checkRecoveryMode(price)
      expect(recoveryMode).to.equal(false)
    })
  })

  describe("liquidate()", () => {
    async function setupTroveAndLiquidateBob(targetICR: bigint = to1e18("99")) {
      await setupTroveAndSnapshot(alice, "5000", "150")
      await setupTroveAndSnapshot(bob, "5000", "150")

      await updateTroveManagerSnapshot(contracts, state, "before")

      const price = await dropPrice(contracts, alice, targetICR)
      await contracts.troveManager.liquidate(bob.address)

      return price
    }

    context("Expected Reverts", () => {
      it("liquidate(): reverts with ICR > 110%, and StabilityPool MUSD < liquidated debt", async () => {
        await setupTrovesStabilityPoolLessThanDebt()

        await dropPrice(contracts, bob, to1e18("112"))
        await expect(
          contracts.troveManager.liquidate(bob.address),
        ).to.be.revertedWith("TroveManager: nothing to liquidate")
      })

      it("liquidate(): Doesn't liquidate undercollateralized trove if it is the only trove in the system", async () => {
        await setupTrove(alice, "5000", "150")
        await dropPrice(contracts, alice, to1e18("99"))
        await expect(
          contracts.troveManager.liquidate(alice.address),
        ).to.be.revertedWith("TroveManager: nothing to liquidate")
      })

      it("liquidate(), with ICR > 110%, trove has lowest ICR, and StabilityPool is empty: does nothing", async () => {
        await setupTroveAndSnapshot(alice, "50,000", "240")
        await setupTroveAndSnapshot(bob, "5000", "270")

        await dropPrice(contracts, alice, to1e18("100"))
        await expect(
          contracts.troveManager.liquidate(bob.address),
        ).to.be.revertedWith("TroveManager: nothing to liquidate")
      })

      it("liquidate(): does nothing if trove ICR >= TCR, and SP covers trove's debt", async () => {
        await setupTroveAndSnapshot(alice, "5000", "200")
        await setupTroveAndSnapshot(bob, "15,000", "180")

        const spDeposit = to1e18("10,000")
        await provideToSP(contracts, bob, spDeposit)

        await dropPrice(contracts, bob)

        await expect(
          contracts.troveManager.liquidate(alice.address),
        ).to.be.revertedWith("TroveManager: nothing to liquidate")
      })

      it("liquidate(): reverts if trove is non-existent", async () => {
        await setupTrove(alice, "5000", "150")
        await dropPrice(contracts, alice, to1e18("100"))
        await expect(
          contracts.troveManager.liquidate(bob.address),
        ).to.be.revertedWith("TroveManager: Trove does not exist or is closed")
      })

      it("liquidate(): reverts if trove has been closed", async () => {
        await setupTrove(alice, "5000", "150")
        await setupTrove(bob, "5000", "150")
        await dropPriceAndLiquidate(contracts, alice)
        await expect(
          contracts.troveManager.liquidate(alice.address),
        ).to.be.revertedWith("TroveManager: Trove does not exist or is closed")
      })
    })

    context("Emitted Events", () => {})

    context("System State Changes", () => {
      it("liquidate(), with ICR < 100%: removes stake and updates totalStakes", async () => {
        await setupTroveAndLiquidateBob()

        await updateTroveSnapshot(contracts, alice, "after")
        await updateTroveSnapshot(contracts, bob, "after")
        await updateTroveManagerSnapshot(contracts, state, "after")

        expect(bob.trove.stake.after).to.equal(0n)
        expect(state.troveManager.stakes.after).to.equal(
          alice.trove.collateral.after,
        )
      })

      it("liquidate(), with 100% < ICR < 110%: removes stake and updates totalStakes", async () => {
        await setupTroveAndLiquidateBob(to1e18("105"))

        await updateTroveSnapshot(contracts, alice, "after")
        await updateTroveSnapshot(contracts, bob, "after")
        await updateTroveManagerSnapshot(contracts, state, "after")

        expect(bob.trove.stake.after).to.equal(0n)
        expect(state.troveManager.stakes.after).to.equal(
          alice.trove.collateral.after,
        )
      })

      it("liquidate(), with ICR < 100%: updates system snapshots correctly", async () => {
        await setupTroveAndLiquidateBob()

        await updateTroveManagerSnapshot(contracts, state, "after")

        expect(state.troveManager.collateralSnapshot.after).to.equal(
          await getTroveEntireColl(contracts, alice.wallet),
        )
        expect(state.troveManager.stakesSnapshot.after).to.equal(
          alice.trove.stake.before,
        )
      })

      it("liquidate(), with 100% < ICR < 110%: updates system snapshots correctly", async () => {
        await setupTroveAndLiquidateBob(to1e18("105"))

        await updateTroveManagerSnapshot(contracts, state, "after")

        expect(state.troveManager.collateralSnapshot.after).to.equal(
          await getTroveEntireColl(contracts, alice.wallet),
        )
        expect(state.troveManager.stakesSnapshot.after).to.equal(
          alice.trove.stake.before,
        )
      })
    })

    context("Individual Troves", () => {
      it("liquidate(), with ICR < 100%: closes the Trove and removes it from the Trove array", async () => {
        await setupTroveAndLiquidateBob()

        expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(
          true,
        )
      })

      it("liquidate(), with 100% < ICR < 110%: closes the Trove and removes it from the Trove array", async () => {
        await setupTroveAndLiquidateBob(to1e18("105"))

        expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(
          true,
        )
      })

      it("liquidate(): liquidates based on entire collateral/debt (including pending rewards), not raw collateral/debt", async () => {
        await setupTroveAndSnapshot(alice, "2000", "400")
        await setupTroveAndSnapshot(bob, "2000", "221")
        await setupTroveAndSnapshot(carol, "2000", "200")
        await setupTroveAndSnapshot(dennis, "2000", "200")

        // Drop the price and liquidate Dennis to create pending rewards for everyone
        const price = await dropPrice(contracts, dennis, to1e18("100"))
        await contracts.troveManager.liquidate(dennis.address)

        await updateTroveSnapshot(contracts, bob, "after")

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          true,
        )

        // Check that Bob's "raw" ICR (not including pending rewards) is above MCR
        const mcr = await contracts.troveManager.MCR()
        expect(
          (bob.trove.collateral.after * price) / bob.trove.debt.after,
        ).to.be.greaterThan(mcr)

        // Bob's ICR (with pending rewards) should be below MCR
        expect(bob.trove.icr.after).to.be.lessThan(mcr)

        await expect(
          contracts.troveManager.liquidate(alice.address),
        ).to.be.revertedWith("TroveManager: nothing to liquidate")
        await contracts.troveManager.liquidate(bob.address)
        await contracts.troveManager.liquidate(carol.address)

        expect(await checkTroveActive(contracts, alice))
        expect(await checkTroveClosedByLiquidation(contracts, bob))
        expect(await checkTroveClosedByLiquidation(contracts, carol))
      })
    })

    context("Balance changes", () => {
      it("liquidate(): does not alter the liquidated user's token balance", async () => {
        await setupTroveAndSnapshot(alice, "5000", "400")
        await setupTroveAndSnapshot(bob, "5000", "400")
        await dropPriceAndLiquidate(contracts, alice)
        expect(await contracts.musd.balanceOf(alice.wallet)).to.equal(
          to1e18("5200"),
        )
      })
    })

    context("State changes in other contracts", () => {
      it("liquidate(), with ICR < 100%: only redistributes to active Troves - no offset to Stability Pool", async () => {
        await setupTroveAndSnapshot(alice, "5000", "400")
        await setupTroveAndSnapshot(bob, "5000", "150")

        await updateStabilityPoolSnapshot(contracts, state, "before")

        await dropPriceAndLiquidate(contracts, bob)
        await updateStabilityPoolSnapshot(contracts, state, "after")

        expect(state.stabilityPool.musd.after).to.equal(
          state.stabilityPool.musd.before,
        )
      })

      it("liquidate(), with 100% < ICR < 110%: offsets as much debt as possible with the Stability Pool, then redistributes the remainder coll and debt", async () => {
        await setupTroveAndSnapshot(alice, "5000", "150")
        await setupTroveAndSnapshot(bob, "5000", "150")
        const spDeposit = to1e18("1000")
        await provideToSP(contracts, alice, spDeposit)

        await updateStabilityPoolSnapshot(contracts, state, "before")
        await updatePendingSnapshot(contracts, alice, "after")

        await dropPrice(contracts, bob, to1e18("105"))
        await contracts.troveManager.liquidate(bob.address)
        await updateStabilityPoolSnapshot(contracts, state, "after")
        await updatePendingSnapshot(contracts, alice, "after")

        expect(state.stabilityPool.musd.after).to.equal(0n)
        expect(alice.pending.debt.after).to.be.closeTo(
          bob.trove.debt.before - spDeposit,
          100n,
        )
        expect(alice.pending.collateral.after).to.be.closeTo(
          applyLiquidationFee(bob.trove.collateral.before) -
            state.stabilityPool.collateral.after,
          100n,
        )
      })

      it("liquidate(), with 110% < ICR < TCR, and StabilityPool MUSD > debt to liquidate: offsets the trove entirely with the pool", async () => {
        const { spDeposit, totalDebt } =
          await setupTrovesForStabilityPoolTests()

        await updateStabilityPoolSnapshot(contracts, state, "before")
        await dropPrice(contracts, bob, to1e18("112"))
        await contracts.troveManager.liquidate(bob.address)
        await updateStabilityPoolSnapshot(contracts, state, "after")

        expect(state.stabilityPool.musd.after).to.equal(spDeposit - totalDebt)
      })

      it("liquidate(), with ICR% = 110 < TCR, and StabilityPool MUSD > debt to liquidate: offsets the trove entirely with the pool, there’s no collateral surplus", async () => {
        await setupTrovesForStabilityPoolTests()

        await dropPrice(contracts, bob, to1e18("110"))
        await contracts.troveManager.liquidate(bob.address)

        expect(
          await contracts.collSurplusPool.getCollateral(bob.address),
        ).to.equal(0n)
      })

      it("liquidate(), with  110% < ICR < TCR, and StabilityPool MUSD > debt to liquidate: removes stake and updates totalStakes", async () => {
        await setupTrovesForStabilityPoolTests()

        await updateStabilityPoolSnapshot(contracts, state, "before")
        await dropPrice(contracts, bob, to1e18("112"))
        await contracts.troveManager.liquidate(bob.address)
        await updateStabilityPoolSnapshot(contracts, state, "after")

        await updateTroveSnapshot(contracts, bob, "after")
        await updateTroveManagerSnapshot(contracts, state, "after")
        expect(bob.trove.stake.after).to.equal(0n)
        expect(state.troveManager.stakes.after).to.equal(
          alice.trove.collateral.before + dennis.trove.collateral.before,
        )
      })

      it("liquidate(), with  110% < ICR < TCR, and StabilityPool MUSD > debt to liquidate: updates system snapshots", async () => {
        await setupTrovesForStabilityPoolTests()
        await updateTroveManagerSnapshot(contracts, state, "before")
        await dropPrice(contracts, bob, to1e18("112"))
        await contracts.troveManager.liquidate(bob.address)
        await updateTroveManagerSnapshot(contracts, state, "after")
        expect(state.troveManager.stakesSnapshot.after).to.equal(
          alice.trove.collateral.before + dennis.trove.collateral.before,
        )
        expect(state.troveManager.collateralSnapshot.after).to.equal(
          alice.trove.collateral.before + dennis.trove.collateral.before,
        )
      })

      it("liquidate(), with 110% < ICR < TCR, and StabilityPool MUSD > debt to liquidate: closes the Trove", async () => {
        await setupTrovesForStabilityPoolTests()
        await dropPrice(contracts, bob, to1e18("112"))
        await contracts.troveManager.liquidate(bob.address)
        expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(
          true,
        )
      })

      it("liquidate(), with 110% < ICR < TCR, and StabilityPool THUSD > debt to liquidate: can liquidate troves out of order", async () => {
        await setupTroveAndSnapshot(alice, "5000", "200")
        await setupTroveAndSnapshot(bob, "5000", "202")
        await setupTroveAndSnapshot(carol, "5000", "204")
        await setupTroveAndSnapshot(dennis, "5000", "206")
        const totalDebtToBeLiquidated =
          alice.trove.debt.before +
          bob.trove.debt.before +
          carol.trove.debt.before +
          dennis.trove.debt.before
        await openTrove(contracts, {
          musdAmount: totalDebtToBeLiquidated + to1e18("5000"),
          ICR: "210",
          sender: eric.wallet,
        })

        await provideToSP(
          contracts,
          eric,
          totalDebtToBeLiquidated + to1e18("1"),
        )

        await dropPrice(contracts, alice, to1e18("111"))

        // Troves should be ordered by ICR, low to high: A, B, C, D, E
        await updateTroveSnapshot(contracts, carol, "after")

        // Liquidate out of ICR order
        await contracts.troveManager.liquidate(carol.address)
        await contracts.troveManager.liquidate(dennis.address)
        await contracts.troveManager.liquidate(bob.address)
        await contracts.troveManager.liquidate(alice.address)

        expect(await checkTroveClosedByLiquidation(contracts, carol)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, dennis)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, bob)).to.equal(
          true,
        )
        expect(await checkTroveClosedByLiquidation(contracts, alice)).to.equal(
          true,
        )
      })

      it("liquidate(): with 110% < ICR < TCR, can claim collateral, re-open, be redeemed and claim again", async () => {
        await setupTrovesForStabilityPoolTests()

        const price = await contracts.priceFeed.fetchPrice()
        await dropPrice(contracts, bob, to1e18("111"))
        expect(await checkRecoveryMode()).to.equal(true)

        await contracts.troveManager.liquidate(bob.address)

        await contracts.borrowerOperations
          .connect(bob.wallet)
          .claimCollateral(NO_GAS)

        await contracts.mockAggregator.setPrice(price)
        const { netDebt } = await setupTrove(bob, "1800", "120")
        await contracts.troveManager
          .connect(dennis.wallet)
          .redeemCollateral(
            netDebt,
            bob.address,
            bob.address,
            bob.address,
            0,
            0,
            to1e18("1"),
            NO_GAS,
          )
        await updateWalletSnapshot(contracts, bob, "before")
        const surplus = await contracts.collSurplusPool.getCollateral(
          bob.address,
        )
        await contracts.borrowerOperations
          .connect(bob.wallet)
          .claimCollateral(NO_GAS)
        await updateWalletSnapshot(contracts, bob, "after")
        expect(bob.btc.after).to.equal(bob.btc.before + surplus)
      })

      it("liquidate(): with 110% < ICR < TCR, can claim collateral, after another claim from a redemption", async () => {
        // Open two troves:
        const { netDebt } = await setupTrove(bob, "2000", "222")
        await setupTrove(alice, "5000", "266")

        // A redeems some collateral, creating a surplus for B
        await contracts.troveManager
          .connect(alice.wallet)
          .redeemCollateral(
            netDebt,
            bob.address,
            bob.address,
            bob.address,
            0,
            0,
            to1e18("1"),
            NO_GAS,
          )

        // B claims collateral
        await contracts.borrowerOperations
          .connect(bob.wallet)
          .claimCollateral(NO_GAS)

        // B reopens trove
        const { totalDebt } = await setupTroveAndSnapshot(bob, "2000", "240")

        // C opens a trove and deposits to SP
        await setupTrove(carol, "5000", "266")
        const spDeposit = totalDebt
        await provideToSP(contracts, carol, spDeposit)

        // Price drops, reducing TCR below 150%
        await dropPrice(contracts, alice, to1e18("149"))

        // B is liquidated
        await contracts.troveManager.liquidate(bob.address)

        // B claims collateral
        await updateWalletSnapshot(contracts, bob, "before")
        const surplus = await contracts.collSurplusPool.getCollateral(
          bob.address,
        )
        await contracts.borrowerOperations
          .connect(bob.wallet)
          .claimCollateral(NO_GAS)

        // Check balance and coll surplus are equal
        await updateWalletSnapshot(contracts, bob, "after")
        expect(bob.btc.after).to.equal(bob.btc.before + surplus)
      })
    })
  })
})
