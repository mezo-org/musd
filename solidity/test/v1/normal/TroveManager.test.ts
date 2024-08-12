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
  getEventArgByName,
  getTCR,
  openTrove,
  provideToSP,
  TestingAddresses,
  TestSetup,
  updateContractsSnapshot,
  updateStabilityPoolSnapshot,
  updateTroveSnapshot,
  User,
} from "../../helpers"
import { to1e18 } from "../../utils"
import debugBalances from "../../helpers/debugging.ts"

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

  it("liquidate(): closes a Trove that has ICR < MCR", async () => {
    await setupTroves()
    // Alice's Trove has ICR = 4, which is above the MCR
    await updateTroveSnapshot(contracts, alice, "before")
    expect(alice.trove.icr.before).to.be.equal(to1e18(4))

    const mcr = (await contracts.troveManager.MCR()).toString()
    expect(mcr).to.be.equal(to1e18(1.1))

    const targetICR = 1111111111111111111n

    // Alice increases debt to lower her ICR to 1.111111111111111111
    await adjustTroveToICR(contracts, alice.wallet, targetICR)

    await updateTroveSnapshot(contracts, alice, "after")
    expect(alice.trove.icr.after).to.equal(targetICR)

    // price drops reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))
    const newPrice = await contracts.priceFeed.fetchPrice()

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
    expect(status).to.be.equal(3) // status enum 3 corresponds to "Closed by liquidation"

    const aliceTroveIsInSortedList = await contracts.sortedTroves.contains(
      alice.wallet.address,
    )

    expect(aliceTroveIsInSortedList).to.equal(false)
  })

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
    expect(state.activePool.collateral.before).to.be.equal(
      expectedCollateralBefore,
    )
    expect(state.activePool.btc.before).to.be.equal(expectedCollateralBefore)

    // check MUSD Debt
    state.activePool.debt.before = await contracts.activePool.getMUSDDebt()
    expect(state.activePool.debt.before).to.be.equal(
      alice.trove.debt.before + bob.trove.debt.before,
    )

    // price drops reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))

    /* Close Alice's Trove. Should liquidate her collateral and MUSD,
     * leaving Bob’s collateral and MUSD debt in the ActivePool. */
    await contracts.troveManager.liquidate(alice.wallet.address)

    await updateContractsSnapshot(
      contracts,
      state,
      "activePool",
      "after",
      addresses,
    )

    expect(state.activePool.collateral.after).to.be.equal(
      bob.trove.collateral.before,
    )
    expect(state.activePool.btc.after).to.be.equal(bob.trove.collateral.before)

    // check ActivePool MUSD debt
    state.activePool.debt.after = await contracts.activePool.getMUSDDebt()
    expect(state.activePool.debt.after).to.be.equal(bob.trove.debt.before)
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
    expect(state.defaultPool.collateral.before).to.be.equal(0n)
    expect(state.defaultPool.btc.before).to.be.equal(0n)

    // check MUSD Debt
    state.defaultPool.debt.before = await contracts.defaultPool.getMUSDDebt()
    expect(state.defaultPool.debt.before).to.be.equal(0n)

    // price drops to 1ETH/token:1000MUSD, reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))

    // Close Alice's Trove
    await contracts.troveManager.liquidate(alice.wallet.address)

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
    expect(state.defaultPool.collateral.after).to.be.equal(
      expectedDefaultPoolCollateral,
    )
    expect(state.defaultPool.btc.after).to.be.equal(
      expectedDefaultPoolCollateral,
    )

    // DefaultPool total debt after should increase by Alice's total debt
    state.defaultPool.debt.after = await contracts.defaultPool.getMUSDDebt()
    expect(state.defaultPool.debt.after).to.be.equal(alice.trove.debt.before)
  })

  it("liquidate(): removes the Trove's stake from the total stakes", async () => {
    await setupTroves()
    await updateTroveSnapshot(contracts, alice, "before")
    await updateTroveSnapshot(contracts, bob, "before")

    state.troveManager.stakes.before =
      await contracts.troveManager.totalStakes()
    expect(state.troveManager.stakes.before).to.be.equal(
      alice.trove.stake.before + bob.trove.stake.before,
    )

    // price drops reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))

    // Close Alice's Trove
    await contracts.troveManager.liquidate(alice.wallet.address)

    state.troveManager.stakes.after = await contracts.troveManager.totalStakes()
    expect(state.troveManager.stakes.after).to.be.equal(bob.trove.stake.before)
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
    state.troveManager.troves.before =
      await contracts.troveManager.getTroveOwnersCount()
    expect(state.troveManager.troves.before).to.be.equal(5)

    // Drop the price to lower ICRs below MCR and close Carol's trove
    await contracts.mockAggregator.setPrice(to1e18(1000))
    await contracts.troveManager.liquidate(carol.wallet.address)

    // Check that carol no longer has an active trove
    expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(false)

    // Check that the TroveOwners array has been updated correctly
    state.troveManager.troves.after =
      await contracts.troveManager.getTroveOwnersCount()
    expect(state.troveManager.troves.after).to.be.equal(4)

    /* After Carol is removed from the array, the last element (Eric's address) should have been moved to fill the
     * empty slot left by Carol. The TroveOwners array should now be: [Bob, Alice, Eric, Dennis] */
    const troveOwners = await Promise.all([
      contracts.troveManager.TroveOwners(0),
      contracts.troveManager.TroveOwners(1),
      contracts.troveManager.TroveOwners(2),
      contracts.troveManager.TroveOwners(3),
    ])

    expect(troveOwners[0]).to.be.equal(addresses.alice)
    expect(troveOwners[1]).to.be.equal(addresses.bob)
    expect(troveOwners[2]).to.be.equal(addresses.eric)
    expect(troveOwners[3]).to.be.equal(addresses.dennis)

    // Check that the correct indices are recorded on the active trove structs
    const troveStructs = await Promise.all([
      contracts.troveManager.Troves(addresses.alice),
      contracts.troveManager.Troves(addresses.bob),
      contracts.troveManager.Troves(addresses.eric),
      contracts.troveManager.Troves(addresses.dennis),
    ])
    expect(troveStructs[0][4]).to.be.equal(0)
    expect(troveStructs[1][4]).to.be.equal(1)
    expect(troveStructs[2][4]).to.be.equal(2)
    expect(troveStructs[3][4]).to.be.equal(3)
  })

  it("liquidate(): updates the snapshots of total stakes and total collateral", async () => {
    await setupTroves()
    await updateTroveSnapshot(contracts, alice, "before")
    await updateTroveSnapshot(contracts, bob, "before") // not strictly necessary but for completeness

    expect(await contracts.troveManager.totalStakesSnapshot()).to.be.equal(0n)
    expect(await contracts.troveManager.totalCollateralSnapshot()).to.be.equal(
      0n,
    )

    // Drop the price to lower ICRs below MCR and close Alice's trove
    await contracts.mockAggregator.setPrice(to1e18(1000))
    await contracts.troveManager.liquidate(alice.wallet.address)

    // Total stakes should be equal to Bob's stake
    await updateTroveSnapshot(contracts, bob, "after")
    expect(await contracts.troveManager.totalStakesSnapshot()).to.be.equal(
      bob.trove.stake.after,
    )

    /*
     Total collateral should be equal to Bob's collateral plus his pending collateral reward (Alice's collateral less liquidation fee)
     earned from the liquidation of Alice's trove
    */
    const expectedCollateral =
      bob.trove.collateral.after +
      applyLiquidationFee(alice.trove.collateral.before)
    expect(await contracts.troveManager.totalCollateralSnapshot()).to.be.equal(
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
    expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(false)

    // Carol's collateral less the liquidation fee and MUSD should be added to the default pool
    const liquidatedColl = to1e18(
      applyLiquidationFee(carol.trove.collateral.before),
    )
    const remainingColl =
      bob.trove.collateral.before + alice.trove.collateral.before
    const expectedLCollateralAfterCarolLiquidated =
      liquidatedColl / remainingColl
    expect(await contracts.troveManager.L_Collateral()).to.be.equal(
      expectedLCollateralAfterCarolLiquidated,
    )

    const expectedLMUSDDebtAfterCarolLiquidated =
      to1e18(carol.trove.debt.before) / remainingColl
    expect(await contracts.troveManager.L_MUSDDebt()).to.be.equal(
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
    expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(false)

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

    expect(await contracts.troveManager.L_Collateral()).to.be.equal(
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

  it("liquidate(): Liquidates undercollateralized trove if there are two troves in the system", async () => {
    await setupTroves()
    await updateTroveSnapshot(contracts, alice, "before")
    await updateTroveSnapshot(contracts, bob, "before")

    // price drops reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))

    await updateTroveSnapshot(contracts, alice, "after")
    await updateTroveSnapshot(contracts, bob, "after")
    expect(alice.trove.icr.after).to.be.lt(to1e18(1.1))

    expect(await contracts.troveManager.getTroveOwnersCount()).to.be.equal(2)

    // Close trove
    await contracts.troveManager.liquidate(alice.wallet.address)

    // Check Alice's trove is removed, and bob remains
    expect(await contracts.troveManager.getTroveOwnersCount()).to.be.equal(1)
    expect(
      await contracts.sortedTroves.contains(alice.wallet.address),
    ).to.be.equal(false)
    expect(
      await contracts.sortedTroves.contains(bob.wallet.address),
    ).to.be.equal(true)
  })

  it("liquidate(): reverts if trove has been closed", async () => {
    await setupTroves()
    await updateTroveSnapshot(contracts, alice, "before")

    // price drops reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))

    // Close trove
    await contracts.troveManager.liquidate(alice.wallet.address)

    // Check Alice's trove is removed
    expect(
      await contracts.sortedTroves.contains(alice.wallet.address),
    ).to.be.equal(false)

    // Try to close the trove again
    await expect(
      contracts.troveManager.liquidate(alice.wallet.address),
    ).to.be.revertedWith("TroveManager: Trove does not exist or is closed")
  })

  it("liquidate(): does nothing if trove has >= 110% ICR", async () => {
    await setupTroves()
    state.troveManager.troves.before =
      await contracts.troveManager.getTroveOwnersCount()

    const price = await contracts.priceFeed.fetchPrice()
    const tcrBefore = await contracts.troveManager.getTCR(price)

    // Attempt to liquidate Alice
    await expect(
      contracts.troveManager.liquidate(alice.wallet.address),
    ).to.be.revertedWith("TroveManager: nothing to liquidate")

    // Check Alice and Bob are still active
    expect(
      await contracts.sortedTroves.contains(alice.wallet.address),
    ).to.be.equal(true)
    expect(
      await contracts.sortedTroves.contains(bob.wallet.address),
    ).to.be.equal(true)

    state.troveManager.troves.after =
      await contracts.troveManager.getTroveOwnersCount()
    expect(state.troveManager.troves.before).to.be.equal(
      state.troveManager.troves.after,
    )

    const tcrAfter = await contracts.troveManager.getTCR(price)
    expect(tcrBefore).to.be.equal(tcrAfter)
  })

  it(
    "liquidate(): Given the same price and no other trove changes, " +
      "complete Pool offsets restore the TCR to its value prior to the defaulters opening troves",
    async () => {
      await setupTroves()
      // Approve up to $10k to be sent to the stability pool for Bob.
      await contracts.musd
        .connect(bob.wallet)
        .approve(addresses.stabilityPool, to1e18(10000))

      await contracts.stabilityPool
        .connect(bob.wallet)
        .provideToSP(to1e18(10000))

      const tcrBefore = await getTCR(contracts)

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

      expect(await contracts.sortedTroves.contains(carol.wallet)).to.be.equal(
        true,
      )
      expect(await contracts.sortedTroves.contains(dennis.wallet)).to.be.equal(
        true,
      )
      expect(await contracts.sortedTroves.contains(eric.wallet)).to.be.equal(
        true,
      )

      // price drops reducing ICRs below MCR
      const price = await contracts.priceFeed.fetchPrice()
      await contracts.mockAggregator.setPrice((price * 80n) / 100n)

      // liquidate defaulters
      await contracts.troveManager.liquidate(carol.wallet.address)
      await contracts.troveManager.liquidate(dennis.wallet.address)
      await contracts.troveManager.liquidate(eric.wallet.address)

      // Check defaulters are removed
      expect(await contracts.sortedTroves.contains(carol.wallet)).to.be.equal(
        false,
      )
      expect(await contracts.sortedTroves.contains(dennis.wallet)).to.be.equal(
        false,
      )
      expect(await contracts.sortedTroves.contains(eric.wallet)).to.be.equal(
        false,
      )

      // Price bounces back
      await contracts.mockAggregator.setPrice(price)

      // Check TCR is restored
      const tcrAfter = await getTCR(contracts)
      expect(tcrAfter).to.be.equal(tcrBefore)
    },
  )
  it("liquidate(): Pool offsets increase the TCR", async () => {
    await setupTroves()
    // Approve up to $10k to be sent to the stability pool for Bob.
    await contracts.musd
      .connect(bob.wallet)
      .approve(addresses.stabilityPool, to1e18(10000))

    await contracts.stabilityPool.connect(bob.wallet).provideToSP(to1e18(10000))

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
    ).to.be.equal(tcrBefore)

    // Check TCR does not decrease with each liquidation
    const liquidationTx = await contracts.troveManager.liquidate(
      carol.wallet.address,
    )
    const { collGasCompensation } =
      await getEmittedLiquidationValues(liquidationTx)

    const tcrAfter = await getTCR(contracts)

    const remainingColl =
      (entireSystemCollBefore - collGasCompensation) * newPrice

    expect(remainingColl).to.be.equal(
      (await contracts.troveManager.getEntireSystemColl()) * newPrice,
    )

    const remainingDebt = entireSystemDebtBefore
    expect(remainingDebt).to.be.equal(
      await contracts.troveManager.getEntireSystemDebt(),
    )

    expect(tcrAfter).to.be.equal(remainingColl / remainingDebt)
  })

  it("liquidate(): does not affect the SP deposit or collateral gain when called on an SP depositor's address that has no trove", async () => {
    await setupTroves()
    const spDeposit = to1e18(10000)

    // Bob sends tokens to Dennis, who has no trove
    await contracts.musd.connect(bob.wallet).approve(dennis.wallet, spDeposit)
    const allowance = await contracts.musd.allowance(
      bob.wallet.address,
      dennis.wallet.address,
    )
    expect(allowance).to.be.equal(spDeposit)
    await contracts.musd
      .connect(bob.wallet)
      .transfer(dennis.wallet, spDeposit, { from: bob.wallet })

    // Dennis provides MUSD to SP
    await contracts.musd
      .connect(dennis.wallet)
      .approve(addresses.stabilityPool, spDeposit)

    await contracts.stabilityPool.connect(dennis.wallet).provideToSP(spDeposit)

    // Alice gets liquidated
    await contracts.mockAggregator.setPrice(to1e18(1000))
    await contracts.troveManager.liquidate(alice.wallet.address)

    // Dennis' SP deposit has absorbed Carol's debt, and he has received her liquidated collateral
    await updateStabilityPoolSnapshot(contracts, dennis, "before")

    // Attempt to liquidate Dennis
    await expect(
      contracts.troveManager.liquidate(dennis.wallet.address),
    ).to.be.revertedWith("TroveManager: Trove does not exist or is closed")

    // Check Dennis' SP deposit does not change after liquidation attempt
    await updateStabilityPoolSnapshot(contracts, dennis, "after")
    console.log(dennis)
    expect(dennis.stabilityPool.deposit.after).to.be.equal(
      dennis.stabilityPool.deposit.before,
    )
    expect(dennis.stabilityPool.collateralGain.after).to.be.equal(
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
    await updateStabilityPoolSnapshot(contracts, bob, "before")

    // Attempt to liquidate Bob
    await expect(
      contracts.troveManager.liquidate(bob.wallet.address),
    ).to.be.revertedWith("TroveManager: nothing to liquidate")

    // Check that Bob's SP deposit and collateral gain have not changed
    await updateStabilityPoolSnapshot(contracts, bob, "after")

    expect(bob.stabilityPool.deposit.after).to.be.equal(
      bob.stabilityPool.deposit.before,
    )
    expect(bob.stabilityPool.collateralGain.after).to.be.equal(
      bob.stabilityPool.collateralGain.before,
    )
  })

  it("liquidate(): liquidates a SP depositor's trove with ICR < 110%, and the liquidation correctly impacts their SP deposit and collateral gain", async () => {
    await setupTroves()
    // Dennis provides MUSD to SP
    await openTrove(contracts, {
      musdAmount: "50000",
      ICR: "200",
      sender: dennis.wallet,
    })
    const dennisSPDeposit = to1e18(3000)
    await provideToSP(contracts, addresses, dennis.wallet, dennisSPDeposit)

    // Open trove for Carol
    const carolDebt = "1800"
    await openTrove(contracts, {
      musdAmount: carolDebt,
      ICR: "120",
      sender: carol.wallet,
    })

    // Carol gets liquidated
    await dropPriceAndLiquidate(contracts, carol)

    // Check Dennis's SP deposit has absorbed Carol's debt, and he has received her liquidated collateral
    await updateStabilityPoolSnapshot(contracts, dennis, "before")
    // TODO Add expectations to check that updates are correct

    // Bob provides MUSD to SP
    const bobSPDeposit = to1e18(10000)
    await provideToSP(contracts, addresses, bob.wallet, bobSPDeposit)

    // Liquidate Dennis
    const { newPrice } = await dropPriceAndLiquidate(contracts, dennis)

    // Confirm system is not in recovery mode
    expect(
      await contracts.troveManager.checkRecoveryMode(newPrice),
    ).to.be.equal(false)

    // Check Dennis's SP deposit has been reduced to X MUSD and his collateral gain has increased to X BTC/token
    await updateStabilityPoolSnapshot(contracts, dennis, "after")
    await updateStabilityPoolSnapshot(contracts, bob, "after")

    // TODO Finish expectations once stability pool is fixed
    // const totalDeposits = dennis.stabilityPool.deposit.before + bobSPDeposit
    // const expectedDeposit = bobSPDeposit -
    // expect(bob.stabilityPool.deposit.after)
  })

  it("liquidate(): does not alter the liquidated user's token balance", async () => {
    await setupTroves()
    await updateTroveSnapshot(contracts, alice, "before")
    await dropPriceAndLiquidate(contracts, alice)
    expect(await contracts.musd.balanceOf(alice.wallet)).to.be.equal(
      to1e18("5000"),
    )
  })

  it("liquidate(): liquidates based on entire collateral debt (including pending rewards), not raw collateral/debt", async () => {
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

    // Drop the price so that carol and dennis are both below MCR
    const currentPrice = await contracts.priceFeed.fetchPrice()
    const icr = await contracts.troveManager.getCurrentICR(
      dennis.wallet,
      currentPrice,
    )

    // Set target ICR to just slightly less than MCR
    const targetICR = to1e18(1n)

    const newPrice = (targetICR * currentPrice) / icr
    await contracts.mockAggregator.setPrice(newPrice)

    // Liquidate Carol
    await contracts.troveManager.liquidate(carol.address)

    // Dennis's true ICR (including pending rewards) is below the MCR.  Check that his "raw" ICR is above the MCR.
    expect(
      await contracts.troveManager.getCurrentICR(dennis.wallet, newPrice),
    ).to.be.greaterThan(await contracts.troveManager.MCR())

    // Liquidate Dennis
  })
})
