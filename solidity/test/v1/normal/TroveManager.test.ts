import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import {
  adjustTroveToICR,
  applyLiquidationFee,
  connectContracts,
  Contracts,
  ContractsState,
  fixture,
  getAddresses,
  openTrove,
  TestingAddresses,
  TestSetup,
  updateContractsSnapshot,
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
  })

  it("liquidate(): closes a Trove that has ICR < MCR", async () => {
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
})
