import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import {
  adjustTroveToICR,
  applyLiquidationFee,
  connectContracts,
  Contracts,
  ContractsState,
  dropPriceAndLiquidate,
  fixture,
  getAddresses,
  getEmittedLiquidationValues,
  getTCR,
  openTrove,
  provideToSP,
  TestingAddresses,
  TestSetup,
  updateContractsSnapshot,
  updateStabilityPoolUserSnapshot,
  updateTroveManagerSnapshot,
  updateTroveSnapshot,
  User,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("TroveManager in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let state: ContractsState
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

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

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    state = testSetup.state

    await connectContracts(contracts, testSetup.users)

    // users
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    dennis = testSetup.users.dennis
    eric = testSetup.users.eric

    // readability helper
    addresses = await getAddresses(contracts, testSetup.users)
  })

  describe("liquidate()", () => {
    /**
     *
     * Expected Reverts
     *
     */

    context("Expected Reverts", () => {
      it("liquidate(): reverts if trove has been closed", async () => {
        await setupTroves()
        await updateTroveSnapshot(contracts, alice, "before")

        // price drops reducing Alice's ICR below MCR
        await dropPriceAndLiquidate(contracts, alice)

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

    /**
     *
     * Emitted Events
     *
     */

    context("Emitted Events", () => {})

    /**
     *
     * System State Changes
     *
     */

    context("System State Changes", () => {
      it("liquidate(): removes the Trove's stake from the total stakes", async () => {
        await setupTroves()
        await updateTroveSnapshot(contracts, alice, "before")
        await updateTroveSnapshot(contracts, bob, "before")
        await updateTroveManagerSnapshot(contracts, state, "before")

        expect(state.troveManager.stakes.before).to.equal(
          alice.trove.stake.before + bob.trove.stake.before,
        )

        // price drops reducing Alice's ICR below MCR
        await dropPriceAndLiquidate(contracts, alice)

        await updateTroveManagerSnapshot(contracts, state, "after")
        expect(state.troveManager.stakes.after).to.equal(bob.trove.stake.before)
      })

      it("liquidate(): Removes the correct trove from the TroveOwners array, and moves the last array element to the new empty slot", async () => {
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
        await dropPriceAndLiquidate(contracts, carol)

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
          [0, 1, 2, 3].map((index) =>
            contracts.troveManager.TroveOwners(index),
          ),
        )

        expect(troveOwners).to.deep.equal([
          addresses.alice,
          addresses.bob,
          addresses.eric,
          addresses.dennis,
        ])

        // Check that the correct indices are recorded on the active trove structs
        const troveStructs = await Promise.all(
          [alice, bob, eric, dennis].map((user) =>
            contracts.troveManager.Troves(user.address),
          ),
        )
        expect(troveStructs[0][4]).to.equal(0)
        expect(troveStructs[1][4]).to.equal(1)
        expect(troveStructs[2][4]).to.equal(2)
        expect(troveStructs[3][4]).to.equal(3)
      })

      it(
        "liquidate(): Given the same price and no other trove changes, " +
          "complete Pool offsets restore the TCR to its value prior to the defaulters opening troves",
        async () => {
          await setupTroves()
          // Approve up to $10k to be sent to the stability pool for Bob.
          await provideToSP(contracts, addresses, bob.wallet, to1e18("10000"))

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
          await openTrove(contracts, {
            musdAmount: "3000",
            ICR: "120",
            sender: eric.wallet,
          })

          // price drops reducing ICRs below MCR
          const price = await contracts.priceFeed.fetchPrice()
          await contracts.mockAggregator.setPrice((price * 80n) / 100n)

          // liquidate defaulters
          await contracts.troveManager.liquidate(carol.wallet.address)
          await contracts.troveManager.liquidate(dennis.wallet.address)
          await contracts.troveManager.liquidate(eric.wallet.address)

          // Check defaulters are removed
          expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
            false,
          )
          expect(await contracts.sortedTroves.contains(dennis.wallet)).to.equal(
            false,
          )
          expect(await contracts.sortedTroves.contains(eric.wallet)).to.equal(
            false,
          )

          // Price bounces back
          await contracts.mockAggregator.setPrice(price)

          // Check TCR is restored
          await updateTroveManagerSnapshot(contracts, state, "before")
          expect(state.troveManager.TCR.after).to.equal(
            state.troveManager.TCR.before,
          )
        },
      )

      it("liquidate(): Pool offsets increase the TCR", async () => {
        await setupTroves()
        // Approve up to $10k to be sent to the stability pool for Bob.
        await contracts.musd
          .connect(bob.wallet)
          .approve(addresses.stabilityPool, to1e18(10000))

        await contracts.stabilityPool
          .connect(bob.wallet)
          .provideToSP(to1e18(10000))

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
        await contracts.mockAggregator.setPrice((price * 80n) / 100n)

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

      it("liquidate(): a pure redistribution reduces the TCR only as a result of compensation", async () => {
        await setupTroves()
        await openTrove(contracts, {
          musdAmount: "1800",
          ICR: "120",
          sender: carol.wallet,
        })

        // price drops reducing ICR below MCR
        const price = await contracts.priceFeed.fetchPrice()
        const newPrice = (price * 80n) / 100n
        await contracts.mockAggregator.setPrice(newPrice)

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

      it("liquidate(): does not affect the SP deposit or collateral gain when called on an SP depositor's address that has no trove", async () => {
        await setupTroves()
        const spDeposit = to1e18(10000)

        // Bob sends tokens to Dennis, who has no trove
        await contracts.musd
          .connect(bob.wallet)
          .approve(dennis.wallet, spDeposit)
        const allowance = await contracts.musd.allowance(
          bob.wallet.address,
          dennis.wallet.address,
        )
        expect(allowance).to.equal(spDeposit)
        await contracts.musd
          .connect(bob.wallet)
          .transfer(dennis.wallet, spDeposit, { from: bob.wallet })

        // Dennis provides MUSD to SP
        await contracts.musd
          .connect(dennis.wallet)
          .approve(addresses.stabilityPool, spDeposit)

        await contracts.stabilityPool
          .connect(dennis.wallet)
          .provideToSP(spDeposit)

        // Alice gets liquidated
        await dropPriceAndLiquidate(contracts, alice)

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

      it("liquidate(): does not liquidate a SP depositor's trove with ICR > 110%, and does not affect their SP deposit or collateral gain", async () => {
        await setupTroves()
        const spDeposit = to1e18(10000)
        await provideToSP(contracts, addresses, bob.wallet, spDeposit)

        // liquidate Alice
        const { newPrice } = await dropPriceAndLiquidate(contracts, alice)

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

      it("liquidate(): liquidates a SP depositor's trove with ICR < 110%, and the liquidation correctly impacts their SP deposit and collateral gain", async () => {
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
        await provideToSP(contracts, addresses, alice.wallet, aliceSPDeposit)
        await updateStabilityPoolUserSnapshot(contracts, alice, "before")

        // Price drops, carol gets liquidated
        await dropPriceAndLiquidate(contracts, carol)

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
        await provideToSP(contracts, addresses, bob.wallet, bobSPDeposit)

        // Price drops, Alice gets liquidated
        await updateTroveSnapshot(contracts, alice, "after")
        await dropPriceAndLiquidate(contracts, alice)

        // Alice's new deposit should decrease by her share of her own debt
        const totalDeposits =
          alice.stabilityPool.compoundedDeposit.after + bobSPDeposit
        const aliceShareOfDebt =
          (alice.trove.debt.after *
            alice.stabilityPool.compoundedDeposit.after) /
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

      it("liquidate(): updates the snapshots of total stakes and total collateral", async () => {
        await setupTroves()
        await updateTroveSnapshot(contracts, alice, "before")
        await updateTroveSnapshot(contracts, bob, "before") // not strictly necessary but for completeness

        expect(await contracts.troveManager.totalStakesSnapshot()).to.equal(0n)
        expect(await contracts.troveManager.totalCollateralSnapshot()).to.equal(
          0n,
        )

        // Drop the price to lower ICRs below MCR and close Alice's trove
        await dropPriceAndLiquidate(contracts, alice)

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

      it("liquidate(): updates the L_Collateral and L_MUSDDebt reward-per-unit-staked totals", async () => {
        await setupTroves()
        await openTrove(contracts, {
          musdAmount: "5000",
          ICR: "111",
          sender: carol.wallet,
        })

        await updateTroveSnapshot(contracts, alice, "before")
        await updateTroveSnapshot(contracts, bob, "before")
        await updateTroveSnapshot(contracts, carol, "before")

        // Drop the price to lower Carol's ICR below MCR and close Carol's trove
        await contracts.mockAggregator.setPrice(to1e18(49000))
        await contracts.troveManager.liquidate(carol.wallet.address)
        expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
          false,
        )

        // Carol's collateral less the liquidation fee and MUSD should be added to the default pool
        const liquidatedColl = to1e18(
          applyLiquidationFee(carol.trove.collateral.before),
        )
        const remainingColl =
          bob.trove.collateral.before + alice.trove.collateral.before
        const expectedLCollateralAfterCarolLiquidated =
          liquidatedColl / remainingColl
        expect(await contracts.troveManager.L_Collateral()).to.equal(
          expectedLCollateralAfterCarolLiquidated,
        )

        const expectedLMUSDDebtAfterCarolLiquidated =
          to1e18(carol.trove.debt.before) / remainingColl
        expect(await contracts.troveManager.L_MUSDDebt()).to.equal(
          expectedLMUSDDebtAfterCarolLiquidated,
        )

        // Alice now withdraws MUSD, bring her ICR to 1.11
        const { increasedTotalDebt } = await adjustTroveToICR(
          contracts,
          alice.wallet,
          1111111111111111111n,
        )

        // price drops again, reducing Alice's ICR below MCR
        await contracts.mockAggregator.setPrice(to1e18(40000))

        // Close Alice's Trove
        await contracts.troveManager.liquidate(alice.wallet.address)
        expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
          false,
        )

        /*
         * Alice's pending reward was applied to her trove before liquidation.  We account for that here using the previous
         * L_Collateral value computed after Carol's liquidation.
         */
        const aliceCollWithReward = to1e18(
          applyLiquidationFee(
            alice.trove.collateral.before +
              (alice.trove.collateral.before *
                expectedLCollateralAfterCarolLiquidated) /
                to1e18(1),
          ),
        )

        // Bob now has all the active stake.  We now add the reward-per-unit-staked from Alice's liquidation to the L_Collateral.
        const expectedLCollateralAfterAliceLiquidated =
          expectedLCollateralAfterCarolLiquidated +
          aliceCollWithReward / bob.trove.collateral.before

        expect(await contracts.troveManager.L_Collateral()).to.equal(
          expectedLCollateralAfterAliceLiquidated,
        )

        // Apply Alice's pending debt rewards and calculate the new LMUSDDebt
        const expectedLMUSDDebtAfterAliceLiquidated =
          expectedLMUSDDebtAfterCarolLiquidated +
          ((alice.trove.debt.before +
            increasedTotalDebt +
            (alice.trove.collateral.before *
              expectedLMUSDDebtAfterCarolLiquidated) /
              to1e18(1)) *
            to1e18(1)) /
            bob.trove.collateral.before

        const tolerance = 100n
        expect(await contracts.troveManager.L_MUSDDebt()).to.be.closeTo(
          expectedLMUSDDebtAfterAliceLiquidated,
          tolerance,
        )
      })
    })

    /**
     *
     * Individual Troves
     *
     */
    context("Individual Troves", () => {
      it("liquidate(): closes a Trove that has ICR < MCR", async () => {
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
        await contracts.mockAggregator.setPrice(newPrice)

        alice.trove.icr.after = await contracts.troveManager.getCurrentICR(
          addresses.alice,
          newPrice,
        )
        expect(alice.trove.icr.after).to.be.lt(mcr)

        // close trove
        await contracts.troveManager.liquidate(alice.wallet.address)

        // check the Trove is successfully closed, and removed from sortedList
        const status = (
          await contracts.troveManager.Troves(alice.wallet.address)
        )[3]
        expect(status).to.equal(3) // status enum 3 corresponds to "Closed by liquidation"

        const aliceTroveIsInSortedList = await contracts.sortedTroves.contains(
          alice.wallet.address,
        )

        expect(aliceTroveIsInSortedList).to.equal(false)
      })

      it("liquidate(): Liquidates undercollateralized trove if there are two troves in the system", async () => {
        await setupTroves()
        await updateTroveSnapshot(contracts, alice, "before")
        await updateTroveSnapshot(contracts, bob, "before")

        // price drops reducing Alice's ICR below MCR
        await contracts.mockAggregator.setPrice(to1e18(1000))

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

      it("liquidate(): does nothing if trove has >= 110% ICR", async () => {
        await setupTroves()
        await updateTroveManagerSnapshot(contracts, state, "before")

        const price = await contracts.priceFeed.fetchPrice()
        const tcrBefore = await contracts.troveManager.getTCR(price)

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

        const tcrAfter = await contracts.troveManager.getTCR(price)
        expect(tcrBefore).to.equal(tcrAfter)
      })

      it("liquidate(): liquidates based on entire collateral/debt (including pending rewards), not raw collateral/debt", async () => {
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
        await contracts.mockAggregator.setPrice(currentPrice / 2n)

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
        expect(bob.trove.debt.after).to.equal(bob.trove.debt.before)

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

        // Check Alice stays active, Bob and Carol get liquidated
        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          true,
        )
        expect(await contracts.sortedTroves.contains(bob.address)).to.equal(
          false,
        )
        expect(await contracts.sortedTroves.contains(carol.address)).to.equal(
          false,
        )

        // Check Trove statuses - Alice should be active (1), B and C are closed by liquidation (3)
        expect(
          await contracts.troveManager.getTroveStatus(alice.address),
        ).to.equal(1)
        expect(
          await contracts.troveManager.getTroveStatus(bob.address),
        ).to.equal(3)
        expect(
          await contracts.troveManager.getTroveStatus(carol.address),
        ).to.equal(3)
      })
    })

    /**
     *
     * Balance changes
     *
     */

    context("Balance changes", () => {
      it("liquidate(): does not alter the liquidated user's token balance", async () => {
        await setupTroves()
        await updateTroveSnapshot(contracts, alice, "before")
        await dropPriceAndLiquidate(contracts, alice)
        expect(await contracts.musd.balanceOf(alice.wallet)).to.equal(
          to1e18("5000"),
        )
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

    context("State change in other contracts", () => {
      it("liquidate(): decreases ActivePool collateral and MUSDDebt by correct amounts", async () => {
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

        // check MUSD Debt
        state.activePool.debt.before = await contracts.activePool.getMUSDDebt()
        expect(state.activePool.debt.before).to.equal(
          alice.trove.debt.before + bob.trove.debt.before,
        )

        /* Close Alice's Trove. Should liquidate her collateral and MUSD,
         * leaving Bob’s collateral and MUSD debt in the ActivePool. */
        await dropPriceAndLiquidate(contracts, alice)

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

        // check ActivePool MUSD debt
        expect(state.activePool.debt.after).to.equal(bob.trove.debt.before)
      })

      it("liquidate(): increases DefaultPool collateral and MUSD debt by correct amounts", async () => {
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

        // check MUSD Debt
        expect(state.defaultPool.debt.before).to.equal(0n)

        await dropPriceAndLiquidate(contracts, alice)

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
    })
  })
})
