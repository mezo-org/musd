import { expect } from "chai"
import {
  addColl,
  applyLiquidationFee,
  calculateSystemCollFromUsers,
  Contracts,
  dropPriceAndLiquidate,
  expectedCollRewardAmount,
  expectedRewardAmountForUsers,
  getTroveEntireColl,
  getTroveEntireDebt,
  openTrove,
  setupTests,
  updatePendingSnapshot,
  updatePendingSnapshots,
  updateTroveSnapshot,
  updateTroveSnapshots,
  User,
  withdrawColl,
} from "../helpers"
import { to1e18 } from "../utils"

describe("TroveManager - Redistribution reward calculations", () => {
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let frank: User
  let contracts: Contracts

  beforeEach(async () => {
    ;({ alice, bob, carol, dennis, eric, frank, contracts } =
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

  it("A, B Open. B Liquidated. C, D Open. D Liquidated. Distributes correct rewards", async () => {
    await setupTrove(alice, "1800", "400")
    await setupTrove(bob, "1800", "210")
    await updateTroveSnapshots(contracts, [alice, bob], "before")

    const price = await contracts.priceFeed.fetchPrice()
    await dropPriceAndLiquidate(contracts, bob)

    await updatePendingSnapshot(contracts, alice, "before")

    await contracts.mockAggregator.setPrice(price)

    await setupTrove(carol, "1800", "400")
    await setupTrove(dennis, "1800", "210")
    await updateTroveSnapshots(contracts, [carol, dennis], "before")
    await updateTroveSnapshot(contracts, alice, "after")

    await dropPriceAndLiquidate(contracts, dennis)
    await updatePendingSnapshot(contracts, alice, "after")
    await updatePendingSnapshot(contracts, carol, "after")

    const aliceCollAfterL1 =
      alice.trove.collateral.before + alice.pending.collateral.before
    expect(alice.pending.collateral.after).to.equal(
      alice.pending.collateral.before +
        expectedCollRewardAmount(
          aliceCollAfterL1,
          dennis.trove.collateral.before,
          aliceCollAfterL1 + carol.trove.collateral.before,
        ),
    )
    expect(carol.pending.collateral.after).to.equal(
      expectedCollRewardAmount(
        carol.trove.collateral.before,
        dennis.trove.collateral.before,
        aliceCollAfterL1 + carol.trove.collateral.before,
      ),
    )

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([alice, bob, carol]),
      1000,
    )
  })

  it("Sequence of alternate opening/liquidation: final surviving trove has collateral from all previously liquidated troves", async () => {
    // A, B open troves
    await setupTroveAndSnapshot(alice, "1800", "210")
    await setupTroveAndSnapshot(bob, "1800", "210")

    // L1: A liquidated
    const price = await contracts.priceFeed.fetchPrice()
    await dropPriceAndLiquidate(contracts, alice)

    // Price bounces back to original price
    await contracts.mockAggregator.setPrice(price)

    // C opens trove
    await setupTroveAndSnapshot(carol, "1800", "210")

    // L2: B liquidated
    await dropPriceAndLiquidate(contracts, bob)

    // Price bounces back to original price
    await contracts.mockAggregator.setPrice(price)

    // D opens trove
    await setupTroveAndSnapshot(dennis, "1800", "210")

    // L3: C liquidated
    await dropPriceAndLiquidate(contracts, carol)

    // Check that D's collateral is sum of A, B, C's collateral less fees
    await updatePendingSnapshot(contracts, dennis, "after")

    const gainedCollateral = applyLiquidationFee(
      carol.trove.collateral.before +
        applyLiquidationFee(
          bob.trove.collateral.before +
            applyLiquidationFee(alice.trove.collateral.before),
        ),
    )

    expect(gainedCollateral).to.equal(dennis.pending.collateral.after)
  })

  it("A,B,C Open. C Liquidated. B adds coll. A Liquidated. B acquires all coll and debt", async () => {
    const users = [alice, bob, carol]
    await Promise.all(
      users.map((user) => setupTroveAndSnapshot(user, "20000", "210")),
    )

    await dropPriceAndLiquidate(contracts, carol)

    const collFromL1 = expectedCollRewardAmount(
      bob.trove.collateral.before,
      carol.trove.collateral.before,
      bob.trove.collateral.before + alice.trove.collateral.before,
    )

    const addedColl = to1e18(1)
    await addColl(contracts, {
      amount: addedColl,
      sender: bob.wallet,
    })

    const aliceCollAtL2 = await getTroveEntireColl(contracts, alice.wallet)
    const collFromL2 = applyLiquidationFee(aliceCollAtL2)

    await dropPriceAndLiquidate(contracts, alice)

    const bobDebt = await getTroveEntireDebt(contracts, bob.wallet)
    expect(bobDebt).to.be.closeTo(
      alice.trove.debt.before + bob.trove.debt.before + carol.trove.debt.before,
      1000,
    )

    const gainedCollateral = collFromL1 + collFromL2
    const bobColl = await getTroveEntireColl(contracts, bob.wallet)
    expect(bobColl).to.be.closeTo(
      gainedCollateral + bob.trove.collateral.before + addedColl,
      1000,
    )
  })

  it("A,B,C Open. C Liquidated. B tops up coll. D Opens. D Liquidated. Distributes correct rewards.", async () => {
    const users = [alice, bob, carol]
    await Promise.all(
      users.map((user) => setupTroveAndSnapshot(user, "20000", "210")),
    )

    await dropPriceAndLiquidate(contracts, carol)
    await updatePendingSnapshots(contracts, users, "before")

    const addedColl = to1e18(1)
    await addColl(contracts, {
      amount: addedColl,
      sender: bob.wallet,
    })

    await setupTrove(dennis, "20000", "210")

    // Calculate rewards for liquidating Dennis
    const rewardsFromL2 = await expectedRewardAmountForUsers(contracts)(
      dennis,
      [alice, bob, carol, dennis],
    )
    await dropPriceAndLiquidate(contracts, dennis)
    await updatePendingSnapshots(contracts, [...users, dennis], "after")

    // Check collateral values
    expect(
      alice.pending.collateral.after - alice.pending.collateral.before,
    ).to.be.closeTo(rewardsFromL2[alice.address].collateral, 1000)

    // Bob added collateral so his pending rewards were applied from the first liquidation
    expect(bob.pending.collateral.after).to.be.closeTo(
      rewardsFromL2[bob.address].collateral,
      1000,
    )

    expect(carol.pending.collateral.after).to.equal(0n)

    // FIXME This fails when all tests are run but passes when run alone
    expect(dennis.pending.collateral.after).to.equal(0n)

    // Check debt values
    expect(
      alice.pending.principal.after - alice.pending.principal.before,
    ).to.be.closeTo(rewardsFromL2[alice.address].debt, 10000)
    // Bob added collateral so his pending rewards were applied from the first liquidation
    expect(bob.pending.principal.after).to.be.closeTo(
      rewardsFromL2[bob.address].debt,
      10000,
    )

    expect(carol.pending.principal.after).to.equal(0n)
    expect(dennis.pending.principal.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([...users, dennis]),
      1000,
    )
  })

  it("Trove with the majority stake tops up. A,B,C, D open. D Liquidated. C tops up. E opens, E Liquidated. Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await setupTroveAndSnapshot(alice, "20,000", "4000")
    await setupTroveAndSnapshot(bob, "20,000", "4000")
    await setupTroveAndSnapshot(carol, "200,000", "4000")
    await setupTroveAndSnapshot(dennis, "20,000", "210")

    await dropPriceAndLiquidate(contracts, dennis)
    await updatePendingSnapshots(contracts, initialUsers, "before")

    const addedColl = to1e18(0.01)
    await addColl(contracts, {
      amount: addedColl,
      sender: carol.wallet,
    })

    await setupTrove(eric, "20000", "2000")

    const rewards = await expectedRewardAmountForUsers(contracts)(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await updatePendingSnapshots(contracts, [...initialUsers, eric], "after")

    // Check collateral values.  Note C topped up so their rewards from the first liquidation were applied
    expect(
      alice.pending.collateral.after - alice.pending.collateral.before,
    ).to.be.closeTo(rewards[alice.address].collateral, 1000)
    expect(
      bob.pending.collateral.after - bob.pending.collateral.before,
    ).to.be.closeTo(rewards[bob.address].collateral, 1000)
    expect(carol.pending.collateral.after).to.be.closeTo(
      rewards[carol.address].collateral,
      1000,
    )
    expect(dennis.pending.collateral.after).to.equal(0n)
    expect(eric.pending.collateral.after).to.equal(0n)

    // Check debt values
    expect(
      alice.pending.principal.after - alice.pending.principal.before,
    ).to.be.closeTo(rewards[alice.address].debt, 10000)
    expect(
      bob.pending.principal.after - bob.pending.principal.before,
    ).to.be.closeTo(rewards[bob.address].debt, 10000)
    expect(carol.pending.principal.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.principal.after).to.equal(0n)
    expect(eric.pending.principal.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([...initialUsers, eric]),
      1000,
    )
  })

  it("Trove with the majority stake tops up. A,B,C, D open. D Liquidated. A, B, C top up. E opens, E Liquidated. Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await Promise.all(
      initialUsers
        .filter((user) => user.address !== carol.address)
        .map((user) => setupTroveAndSnapshot(user, "20,000", "210")),
    )
    await setupTroveAndSnapshot(carol, "200,000", "400")

    await dropPriceAndLiquidate(contracts, dennis)
    await updatePendingSnapshots(contracts, initialUsers, "before")

    const addedColl = to1e18(1)
    await Promise.all(
      initialUsers
        .filter((user) => user.address !== dennis.address)
        .map((user) =>
          addColl(contracts, { amount: addedColl, sender: user.wallet }),
        ),
    )

    await setupTrove(eric, "20000", "210")

    const rewards = await expectedRewardAmountForUsers(contracts)(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await updatePendingSnapshots(contracts, [...initialUsers, eric], "after")

    // Check collateral values.  Note A, B, C topped up so their rewards from the first liquidation were applied
    expect(alice.pending.collateral.after).to.be.closeTo(
      rewards[alice.address].collateral,
      1000,
    )
    expect(bob.pending.collateral.after).to.be.closeTo(
      rewards[bob.address].collateral,
      1000,
    )
    expect(carol.pending.collateral.after).to.be.closeTo(
      rewards[carol.address].collateral,
      1000,
    )
    expect(dennis.pending.collateral.after).to.equal(0n)
    expect(eric.pending.collateral.after).to.equal(0n)

    // Check debt values
    expect(alice.pending.principal.after).to.be.closeTo(
      rewards[alice.address].debt,
      10000,
    )
    expect(bob.pending.principal.after).to.be.closeTo(
      rewards[bob.address].debt,
      10000,
    )
    expect(carol.pending.principal.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.principal.after).to.equal(0n)
    expect(eric.pending.principal.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([...initialUsers, eric]),
      1000,
    )
  })

  it("A,B,C Open. C Liquidated. B withdraws coll. A Liquidated. B acquires all coll and debt", async () => {
    await setupTroveAndSnapshot(alice, "20000", "210")
    await setupTroveAndSnapshot(bob, "20000", "2000")
    await setupTroveAndSnapshot(carol, "20000", "210")

    await dropPriceAndLiquidate(contracts, carol)

    const collFromL1 = expectedCollRewardAmount(
      bob.trove.collateral.before,
      carol.trove.collateral.before,
      bob.trove.collateral.before + alice.trove.collateral.before,
    )

    const withdrawnColl = to1e18(1)
    await withdrawColl(contracts, {
      amount: withdrawnColl,
      sender: bob.wallet,
    })

    const aliceCollAtL2 = await getTroveEntireColl(contracts, alice.wallet)
    const collFromL2 = applyLiquidationFee(aliceCollAtL2)

    await dropPriceAndLiquidate(contracts, alice)

    const bobDebt = await getTroveEntireDebt(contracts, bob.wallet)
    expect(bobDebt).to.be.closeTo(
      alice.trove.debt.before + bob.trove.debt.before + carol.trove.debt.before,
      1000,
    )

    const gainedCollateral = collFromL1 + collFromL2
    const bobColl = await getTroveEntireColl(contracts, bob.wallet)
    expect(bobColl).to.be.closeTo(
      gainedCollateral + bob.trove.collateral.before - withdrawnColl,
      1000,
    )
  })

  it("A,B,C Open. C Liquidated. B withdraws coll. D Opens. D Liquidated. Distributes correct rewards.", async () => {
    // TODO Consider refactoring to remove duplication and/or use expectedRewardAmountForUsers
    const users = [alice, bob, carol]
    await setupTroveAndSnapshot(alice, "20000", "210")
    await setupTroveAndSnapshot(bob, "20000", "2000")
    await setupTroveAndSnapshot(carol, "20000", "210")

    await dropPriceAndLiquidate(contracts, carol)
    await updatePendingSnapshots(contracts, users, "before")

    const withdrawnColl = to1e18(1)
    await withdrawColl(contracts, {
      amount: withdrawnColl,
      sender: bob.wallet,
    })

    await setupTrove(dennis, "20000", "210")

    // Calculate rewards for liquidating Dennis
    const rewardsFromL2 = await expectedRewardAmountForUsers(contracts)(
      dennis,
      [alice, bob, carol, dennis],
    )
    await dropPriceAndLiquidate(contracts, dennis)
    await updatePendingSnapshots(contracts, users, "after")

    // Check collateral values
    expect(
      alice.pending.collateral.after - alice.pending.collateral.before,
    ).to.be.closeTo(rewardsFromL2[alice.address].collateral, 1000)

    // Bob added collateral so his pending rewards were applied from the first liquidation
    expect(bob.pending.collateral.after).to.be.closeTo(
      rewardsFromL2[bob.address].collateral,
      1000,
    )

    expect(carol.pending.collateral.after).to.equal(0n)
    expect(dennis.pending.collateral.after).to.equal(0n)

    // Check debt values
    expect(
      alice.pending.principal.after - alice.pending.principal.before,
    ).to.be.closeTo(rewardsFromL2[alice.address].debt, 10000)
    // Bob added collateral so his pending rewards were applied from the first liquidation
    expect(bob.pending.principal.after).to.be.closeTo(
      rewardsFromL2[bob.address].debt,
      10000,
    )

    expect(carol.pending.principal.after).to.equal(0n)
    expect(dennis.pending.principal.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([...users, dennis]),
      1000,
    )
  })

  it("Trove with the majority stake tops up. A,B,C, D open. D Liquidated. C withdraws coll. E opens, E Liquidated. Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await setupTroveAndSnapshot(alice, "20,000", "4000")
    await setupTroveAndSnapshot(bob, "20,000", "4000")
    await setupTroveAndSnapshot(carol, "200,000", "4000")
    await setupTroveAndSnapshot(dennis, "20,000", "210")

    await dropPriceAndLiquidate(contracts, dennis)
    await updatePendingSnapshots(contracts, initialUsers, "before")

    const withdrawnColl = to1e18(0.01)
    await withdrawColl(contracts, {
      amount: withdrawnColl,
      sender: carol.wallet,
    })

    await setupTrove(eric, "20000", "2000")

    const rewards = await expectedRewardAmountForUsers(contracts)(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await updatePendingSnapshots(contracts, [...initialUsers, eric], "after")

    // Check collateral values.  Note C withdrew so their rewards from the first liquidation were applied
    expect(
      alice.pending.collateral.after - alice.pending.collateral.before,
    ).to.be.closeTo(rewards[alice.address].collateral, 1000)
    expect(
      bob.pending.collateral.after - bob.pending.collateral.before,
    ).to.be.closeTo(rewards[bob.address].collateral, 1000)
    expect(carol.pending.collateral.after).to.be.closeTo(
      rewards[carol.address].collateral,
      1000,
    )
    expect(dennis.pending.collateral.after).to.equal(0n)
    expect(eric.pending.collateral.after).to.equal(0n)

    // Check debt values
    expect(
      alice.pending.principal.after - alice.pending.principal.before,
    ).to.be.closeTo(rewards[alice.address].debt, 10000)
    expect(
      bob.pending.principal.after - bob.pending.principal.before,
    ).to.be.closeTo(rewards[bob.address].debt, 10000)
    expect(carol.pending.principal.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.principal.after).to.equal(0n)
    expect(eric.pending.principal.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([...initialUsers, eric]),
      1000,
    )
  })

  it("Trove with the majority stake withdraws. A,B,C,D open. D Liquidated. A, B, C withdraw coll. E opens, E Liquidated. Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await setupTroveAndSnapshot(alice, "20,000", "4000")
    await setupTroveAndSnapshot(bob, "20,000", "4000")
    await setupTroveAndSnapshot(carol, "200,000", "4000")
    await setupTroveAndSnapshot(dennis, "20,000", "210")

    await dropPriceAndLiquidate(contracts, dennis)
    await updatePendingSnapshots(contracts, initialUsers, "before")

    const withdrawnColl = to1e18(0.01)
    await Promise.all(
      initialUsers
        .filter((user) => user.address !== dennis.address)
        .map((user) =>
          withdrawColl(contracts, {
            amount: withdrawnColl,
            sender: user.wallet,
          }),
        ),
    )

    await setupTrove(eric, "20000", "2000")

    const rewards = await expectedRewardAmountForUsers(contracts)(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await updatePendingSnapshots(contracts, [...initialUsers, eric], "after")

    // Check collateral values.  Note A, B, C withdrew so their rewards from the first liquidation were applied
    expect(alice.pending.collateral.after).to.be.closeTo(
      rewards[alice.address].collateral,
      1000,
    )
    expect(bob.pending.collateral.after).to.be.closeTo(
      rewards[bob.address].collateral,
      1000,
    )
    expect(carol.pending.collateral.after).to.be.closeTo(
      rewards[carol.address].collateral,
      1000,
    )
    expect(dennis.pending.collateral.after).to.equal(0n)
    expect(eric.pending.collateral.after).to.equal(0n)

    // Check debt values
    expect(alice.pending.principal.after).to.be.closeTo(
      rewards[alice.address].debt,
      10000,
    )
    expect(bob.pending.principal.after).to.be.closeTo(
      rewards[bob.address].debt,
      10000,
    )
    expect(carol.pending.principal.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.principal.after).to.equal(0n)
    expect(eric.pending.principal.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([...initialUsers, eric]),
      1000,
    )
  })

  it("all operations: A,B,C open. A Liquidated. D opens. B adds, C withdraws. B Liquidated. E & F open. D adds. F Liquidated. Distributes correct rewards", async () => {
    const users = [alice, bob, carol]
    await setupTroveAndSnapshot(alice, "20,000", "150")
    await setupTroveAndSnapshot(bob, "20,000", "180")
    await setupTroveAndSnapshot(carol, "20,000", "2000")

    const rewardsFromL1 = await expectedRewardAmountForUsers(contracts)(
      alice,
      users,
    )
    await dropPriceAndLiquidate(contracts, alice)

    await setupTroveAndSnapshot(dennis, "20,000", "210")

    const addedColl = to1e18(1)
    await addColl(contracts, {
      amount: addedColl,
      sender: bob.wallet,
    })

    const withdrawnColl = to1e18(0.01)
    await withdrawColl(contracts, {
      amount: withdrawnColl,
      sender: carol.wallet,
    })

    const rewardsFromL2 = await expectedRewardAmountForUsers(contracts)(bob, [
      ...users,
      dennis,
    ])
    await dropPriceAndLiquidate(contracts, bob)

    await setupTroveAndSnapshot(eric, "20,000", "210")
    await setupTroveAndSnapshot(frank, "20,000", "210")

    await addColl(contracts, {
      amount: addedColl,
      sender: dennis.wallet,
    })

    const rewardsFromL3 = await expectedRewardAmountForUsers(contracts)(frank, [
      ...users,
      dennis,
      eric,
      frank,
    ])
    await dropPriceAndLiquidate(contracts, frank)
    await Promise.all(
      [...users, dennis, eric, frank].map((user) =>
        updatePendingSnapshot(contracts, user, "after"),
      ),
    )

    // Check collateral values
    expect(await getTroveEntireColl(contracts, alice.wallet)).to.equal(0n)
    expect(await getTroveEntireColl(contracts, bob.wallet)).to.equal(0n)
    expect(await getTroveEntireColl(contracts, carol.wallet)).to.be.closeTo(
      carol.trove.collateral.before +
        rewardsFromL1[carol.address].collateral +
        rewardsFromL2[carol.address].collateral +
        rewardsFromL3[carol.address].collateral -
        withdrawnColl,
      1000,
    )
    expect(await getTroveEntireColl(contracts, dennis.wallet)).to.be.closeTo(
      dennis.trove.collateral.before +
        rewardsFromL2[dennis.address].collateral +
        rewardsFromL3[dennis.address].collateral +
        addedColl,
      1000,
    )
    expect(await getTroveEntireColl(contracts, eric.wallet)).to.be.closeTo(
      eric.trove.collateral.before + rewardsFromL3[eric.address].collateral,
      1000,
    )
    expect(await getTroveEntireColl(contracts, frank.wallet)).to.equal(0n)

    expect(await getTroveEntireDebt(contracts, alice.wallet)).to.equal(0n)
    expect(await getTroveEntireDebt(contracts, bob.wallet)).to.equal(0n)
    expect(await getTroveEntireDebt(contracts, carol.wallet)).to.be.closeTo(
      carol.trove.debt.before +
        rewardsFromL1[carol.address].debt +
        rewardsFromL2[carol.address].debt +
        rewardsFromL3[carol.address].debt,
      10000,
    )
    expect(await getTroveEntireDebt(contracts, dennis.wallet)).to.be.closeTo(
      dennis.trove.debt.before +
        rewardsFromL2[dennis.address].debt +
        rewardsFromL3[dennis.address].debt,
      10000,
    )
    expect(await getTroveEntireDebt(contracts, eric.wallet)).to.be.closeTo(
      eric.trove.debt.before + rewardsFromL3[eric.address].debt,
      10000,
    )
    expect(await getTroveEntireDebt(contracts, frank.wallet)).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers(contracts)([
        ...users,
        dennis,
        eric,
        frank,
      ]),
      1000,
    )
  })
})
