import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"
import {
  connectContracts,
  Contracts,
  fixture,
  getAddresses,
  openTrove,
  TestingAddresses,
  TestSetup,
  User,
  adjustTroveToICR,
  updateTroveSnapshot,
  ContractsState,
  applyLiquidationFee,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("TroveManager in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
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

    // price drops to 1ETH/token:1000MUSD, reducing Alice's ICR below MCR
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
    // --- SETUP ---
    await updateTroveSnapshot(contracts, alice, "before")
    await updateTroveSnapshot(contracts, bob, "before")

    // check ActivePool collateral
    state.activePool.collateral.before =
      await contracts.activePool.getCollateralBalance()
    expect(state.activePool.collateral.before).to.be.equal(
      alice.trove.collateral.before + bob.trove.collateral.before,
    )
    state.activePool.btc.before = await ethers.provider.getBalance(
      addresses.activePool,
    )
    expect(state.activePool.btc.before).to.be.equal(
      alice.trove.collateral.before + bob.trove.collateral.before,
    )

    // check MUSD Debt
    state.activePool.debt.before = await contracts.activePool.getMUSDDebt()
    expect(state.activePool.debt.before).to.be.equal(
      alice.trove.debt.before + bob.trove.debt.before,
    )

    // price drops to 1ETH/token:100THUSD, reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))

    /* Close Alice's Trove. Should liquidate her collateral and MUSD,
     * leaving Bob’s collateral and MUSD debt in the ActivePool. */
    await contracts.troveManager.liquidate(alice.wallet.address)

    state.activePool.collateral.after =
      await contracts.activePool.getCollateralBalance()
    expect(state.activePool.collateral.after).to.be.equal(
      bob.trove.collateral.before,
    )
    state.activePool.btc.after = await ethers.provider.getBalance(
      addresses.activePool,
    )
    expect(state.activePool.btc.after).to.be.equal(bob.trove.collateral.before)

    // check ActivePool MUSD debt
    state.activePool.debt.after = await contracts.activePool.getMUSDDebt()
    expect(state.activePool.debt.after).to.be.equal(bob.trove.debt.before)
  })

  it("liquidate(): increases DefaultPool collateral and MUSD debt by correct amounts", async () => {
    // --- SETUP ---
    await updateTroveSnapshot(contracts, alice, "before")
    await updateTroveSnapshot(contracts, bob, "before")

    // check DefaultPool collateral
    state.defaultPool.collateral.before =
      await contracts.defaultPool.getCollateralBalance()
    expect(state.defaultPool.collateral.before).to.be.equal(0n)
    state.defaultPool.btc.before = await ethers.provider.getBalance(
      addresses.defaultPool,
    )
    expect(state.defaultPool.btc.before).to.be.equal(0n)

    // check MUSD Debt
    state.defaultPool.debt.before = await contracts.defaultPool.getMUSDDebt()
    expect(state.defaultPool.debt.before).to.be.equal(0n)

    // price drops to 1ETH/token:1000MUSD, reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))

    // Close Alice's Trove
    await contracts.troveManager.liquidate(alice.wallet.address)

    // DefaultPool collateral should increase by Alice's collateral less the liquidation fee
    const expectedDefaultPoolCollateral = applyLiquidationFee(
      alice.trove.collateral.before,
    )
    state.defaultPool.collateral.after =
      await contracts.defaultPool.getCollateralBalance()
    expect(state.defaultPool.collateral.after).to.be.equal(
      expectedDefaultPoolCollateral,
    )
    state.defaultPool.btc.after = await ethers.provider.getBalance(
      addresses.defaultPool,
    )
    expect(state.defaultPool.btc.after).to.be.equal(
      expectedDefaultPoolCollateral,
    )

    // DefaultPool total debt after should increase by Alice's total debt
    state.defaultPool.debt.after = await contracts.defaultPool.getMUSDDebt()
    expect(state.defaultPool.debt.after).to.be.equal(alice.trove.debt.before)
  })
})
