import { expect } from "chai"
import {
  addColl,
  applyLiquidationFee,
  Contracts,
  dropPriceAndLiquidate,
  getTroveEntireColl,
  getTroveEntireDebt,
  openTrove,
  setupTests,
  updatePendingSnapshot,
  updateTroveSnapshot,
  updateTroveSnapshots,
  User,
  withdrawColl,
} from "../../helpers"
import { to1e18 } from "../../utils"

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

  function expectedCollRewardAmount(
    userColl: bigint,
    liquidatedColl: bigint,
    totalColl: bigint,
  ) {
    return (applyLiquidationFee(liquidatedColl) * userColl) / totalColl
  }

  function expectedDebtRewardAmount(
    userColl: bigint,
    liquidatedDebt: bigint,
    totalColl: bigint,
  ) {
    return (userColl * liquidatedDebt) / totalColl
  }

  async function expectedRewardAmountForUser(
    user: User,
    liquidatedUser: User,
    allUsers: User[],
  ) {
    // Get the total collateral of all users except the liquidated user
    const totalColl = (
      await Promise.all(
        allUsers.map((u) => getTroveEntireColl(contracts, u.wallet)),
      )
    ).reduce((acc, coll) => acc + coll, 0n)

    // Get collateral to be liquidated
    const collateralToLiquidate = await getTroveEntireColl(
      contracts,
      liquidatedUser.wallet,
    )

    const debtToLiquidate = await getTroveEntireDebt(
      contracts,
      liquidatedUser.wallet,
    )

    const remainingColl = totalColl - collateralToLiquidate

    const userCollateral = await getTroveEntireColl(contracts, user.wallet)

    const collateral = expectedCollRewardAmount(
      userCollateral,
      collateralToLiquidate,
      remainingColl,
    )

    const debt = expectedDebtRewardAmount(
      userCollateral,
      debtToLiquidate,
      remainingColl,
    )

    // Calculate expected reward amount for user based on their share of total collateral
    return {
      collateral,
      debt,
    }
  }

  async function expectedRewardAmountForUsers(
    liquidatedUser: User,
    users: User[],
  ) {
    // Map over all users and calculate expected reward amount for each user
    const rewards = await Promise.all(
      users.map(async (user) => [
        user.address,
        await expectedRewardAmountForUser(user, liquidatedUser, users),
      ]),
    )
    return Object.fromEntries(rewards)
  }

  async function calculateSystemCollFromUsers(users: User[]) {
    const collArray = await Promise.all(
      users.map((user) => getTroveEntireColl(contracts, user.wallet)),
    )
    return collArray.reduce((acc, coll) => acc + coll, 0n)
  }

  it("redistribution: A, B Open. B Liquidated. C, D Open. D Liquidated. Distributes correct rewards", async () => {
    await setupTrove(alice, "1800", "400")
    await setupTrove(bob, "1800", "210")
    await updateTroveSnapshots(contracts, [alice, bob], "before")

    const price = await contracts.priceFeed.fetchPrice()
    await dropPriceAndLiquidate(contracts, bob)

    await updatePendingSnapshot(contracts, alice, "before")
    expect(alice.pending.collateral.before).to.equal(
      expectedCollRewardAmount(
        alice.trove.collateral.before,
        bob.trove.collateral.before,
        alice.trove.collateral.before,
      ),
    )

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
      await calculateSystemCollFromUsers([alice, bob, carol]),
      1000,
    )
  })

  it("redistribution: Sequence of alternate opening/liquidation: final surviving trove has collateral from all previously liquidated troves", async () => {
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

  it("redistribution: A,B,C Open. Liq(C). B adds coll. Liq(A). B acquires all coll and debt", async () => {
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

  it("redistribution: A,B,C Open. Liq(C). B tops up coll. D Opens. Liq(D). Distributes correct rewards.", async () => {
    const users = [alice, bob, carol]
    await Promise.all(
      users.map((user) => setupTroveAndSnapshot(user, "20000", "210")),
    )

    await dropPriceAndLiquidate(contracts, carol)
    await Promise.all(
      users.map((user) => updatePendingSnapshot(contracts, user, "before")),
    )

    const addedColl = to1e18(1)
    await addColl(contracts, {
      amount: addedColl,
      sender: bob.wallet,
    })

    await setupTrove(dennis, "20000", "210")

    // Calculate rewards for liquidating Dennis
    const rewardsFromL2 = await expectedRewardAmountForUsers(dennis, [
      alice,
      bob,
      carol,
      dennis,
    ])
    await dropPriceAndLiquidate(contracts, dennis)
    await Promise.all(
      [...users, dennis].map((user) =>
        updatePendingSnapshot(contracts, user, "after"),
      ),
    )

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
    expect(alice.pending.debt.after - alice.pending.debt.before).to.be.closeTo(
      rewardsFromL2[alice.address].debt,
      10000,
    )
    // Bob added collateral so his pending rewards were applied from the first liquidation
    expect(bob.pending.debt.after).to.be.closeTo(
      rewardsFromL2[bob.address].debt,
      10000,
    )

    expect(carol.pending.debt.after).to.equal(0n)
    expect(dennis.pending.debt.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers([...users, dennis]),
      1000,
    )
  })

  it("redistribution: Trove with the majority stake tops up. A,B,C, D open. Liq(D). C tops up. E Enters, Liq(E). Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await setupTroveAndSnapshot(alice, "20,000", "4000")
    await setupTroveAndSnapshot(bob, "20,000", "4000")
    await setupTroveAndSnapshot(carol, "200,000", "4000")
    await setupTroveAndSnapshot(dennis, "20,000", "210")

    await dropPriceAndLiquidate(contracts, dennis)
    await Promise.all(
      initialUsers.map((user) =>
        updatePendingSnapshot(contracts, user, "before"),
      ),
    )

    const addedColl = to1e18(0.01)
    await addColl(contracts, {
      amount: addedColl,
      sender: carol.wallet,
    })

    await setupTrove(eric, "20000", "2000")

    const rewards = await expectedRewardAmountForUsers(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await Promise.all(
      [...initialUsers, eric].map((user) =>
        updatePendingSnapshot(contracts, user, "after"),
      ),
    )

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
    expect(alice.pending.debt.after - alice.pending.debt.before).to.be.closeTo(
      rewards[alice.address].debt,
      10000,
    )
    expect(bob.pending.debt.after - bob.pending.debt.before).to.be.closeTo(
      rewards[bob.address].debt,
      10000,
    )
    expect(carol.pending.debt.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.debt.after).to.equal(0n)
    expect(eric.pending.debt.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers([...initialUsers, eric]),
      1000,
    )
  })

  it("redistribution: Trove with the majority stake tops up. A,B,C, D open. Liq(D). A, B, C top up. E Enters, Liq(E). Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await Promise.all(
      initialUsers
        .filter((user) => user.address !== carol.address)
        .map((user) => setupTroveAndSnapshot(user, "20,000", "210")),
    )
    await setupTroveAndSnapshot(carol, "200,000", "400")

    await dropPriceAndLiquidate(contracts, dennis)
    await Promise.all(
      initialUsers.map((user) =>
        updatePendingSnapshot(contracts, user, "before"),
      ),
    )

    const addedColl = to1e18(1)
    await Promise.all(
      initialUsers
        .filter((user) => user.address !== dennis.address)
        .map((user) =>
          addColl(contracts, { amount: addedColl, sender: user.wallet }),
        ),
    )

    await setupTrove(eric, "20000", "210")

    const rewards = await expectedRewardAmountForUsers(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await Promise.all(
      [...initialUsers, eric].map((user) =>
        updatePendingSnapshot(contracts, user, "after"),
      ),
    )

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
    expect(alice.pending.debt.after).to.be.closeTo(
      rewards[alice.address].debt,
      10000,
    )
    expect(bob.pending.debt.after).to.be.closeTo(
      rewards[bob.address].debt,
      10000,
    )
    expect(carol.pending.debt.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.debt.after).to.equal(0n)
    expect(eric.pending.debt.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers([...initialUsers, eric]),
      1000,
    )
  })

  it("redistribution: A,B,C Open. Liq(C). B withdraws coll. Liq(A). B acquires all coll and debt", async () => {
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

  it("redistribution: A,B,C Open. Liq(C). B withdraws coll. D Opens. Liq(D). Distributes correct rewards.", async () => {
    // TODO Consider refactoring to remove duplication and/or use expectedRewardAmountForUsers
    const users = [alice, bob, carol]
    await setupTroveAndSnapshot(alice, "20000", "210")
    await setupTroveAndSnapshot(bob, "20000", "2000")
    await setupTroveAndSnapshot(carol, "20000", "210")

    await dropPriceAndLiquidate(contracts, carol)
    await Promise.all(
      users.map((user) => updatePendingSnapshot(contracts, user, "before")),
    )

    const withdrawnColl = to1e18(1)
    await withdrawColl(contracts, {
      amount: withdrawnColl,
      sender: bob.wallet,
    })

    await setupTrove(dennis, "20000", "210")

    // Calculate rewards for liquidating Dennis
    const rewardsFromL2 = await expectedRewardAmountForUsers(dennis, [
      alice,
      bob,
      carol,
      dennis,
    ])
    await dropPriceAndLiquidate(contracts, dennis)
    await Promise.all(
      users.map((user) => updatePendingSnapshot(contracts, user, "after")),
    )

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
    expect(alice.pending.debt.after - alice.pending.debt.before).to.be.closeTo(
      rewardsFromL2[alice.address].debt,
      10000,
    )
    // Bob added collateral so his pending rewards were applied from the first liquidation
    expect(bob.pending.debt.after).to.be.closeTo(
      rewardsFromL2[bob.address].debt,
      10000,
    )

    expect(carol.pending.debt.after).to.equal(0n)
    expect(dennis.pending.debt.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers([...users, dennis]),
      1000,
    )
  })

  it("redistribution: Trove with the majority stake tops up. A,B,C, D open. Liq(D). C withdraws coll. E Enters, Liq(E). Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await setupTroveAndSnapshot(alice, "20,000", "4000")
    await setupTroveAndSnapshot(bob, "20,000", "4000")
    await setupTroveAndSnapshot(carol, "200,000", "4000")
    await setupTroveAndSnapshot(dennis, "20,000", "210")

    await dropPriceAndLiquidate(contracts, dennis)
    await Promise.all(
      initialUsers.map((user) =>
        updatePendingSnapshot(contracts, user, "before"),
      ),
    )

    const withdrawnColl = to1e18(0.01)
    await withdrawColl(contracts, {
      amount: withdrawnColl,
      sender: carol.wallet,
    })

    await setupTrove(eric, "20000", "2000")

    const rewards = await expectedRewardAmountForUsers(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await Promise.all(
      [...initialUsers, eric].map((user) =>
        updatePendingSnapshot(contracts, user, "after"),
      ),
    )

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
    expect(alice.pending.debt.after - alice.pending.debt.before).to.be.closeTo(
      rewards[alice.address].debt,
      10000,
    )
    expect(bob.pending.debt.after - bob.pending.debt.before).to.be.closeTo(
      rewards[bob.address].debt,
      10000,
    )
    expect(carol.pending.debt.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.debt.after).to.equal(0n)
    expect(eric.pending.debt.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers([...initialUsers, eric]),
      1000,
    )
  })

  it("redistribution: Trove with the majority stake withdraws. A,B,C, D open. Liq(D). A, B, C withdraw coll. E Enters, Liq(E). Distributes correct rewards", async () => {
    const initialUsers = [alice, bob, carol, dennis]
    await setupTroveAndSnapshot(alice, "20,000", "4000")
    await setupTroveAndSnapshot(bob, "20,000", "4000")
    await setupTroveAndSnapshot(carol, "200,000", "4000")
    await setupTroveAndSnapshot(dennis, "20,000", "210")

    await dropPriceAndLiquidate(contracts, dennis)
    await Promise.all(
      initialUsers.map((user) =>
        updatePendingSnapshot(contracts, user, "before"),
      ),
    )

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

    const rewards = await expectedRewardAmountForUsers(eric, [
      ...initialUsers,
      eric,
    ])
    await dropPriceAndLiquidate(contracts, eric)
    await Promise.all(
      [...initialUsers, eric].map((user) =>
        updatePendingSnapshot(contracts, user, "after"),
      ),
    )

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
    expect(alice.pending.debt.after).to.be.closeTo(
      rewards[alice.address].debt,
      10000,
    )
    expect(bob.pending.debt.after).to.be.closeTo(
      rewards[bob.address].debt,
      10000,
    )
    expect(carol.pending.debt.after).to.be.closeTo(
      rewards[carol.address].debt,
      10000,
    )
    expect(dennis.pending.debt.after).to.equal(0n)
    expect(eric.pending.debt.after).to.equal(0n)

    // Check active pool and default pool balances
    const entireSystemColl = await contracts.troveManager.getEntireSystemColl()
    expect(entireSystemColl).to.be.closeTo(
      await calculateSystemCollFromUsers([...initialUsers, eric]),
      1000,
    )
  })

  it("redistribution, all operations: A,B,C open. Liq(A). D opens. B adds, C withdraws. Liq(B). E & F open. D adds. Liq(F). Distributes correct rewards", async () => {
    const users = [alice, bob, carol]
    await setupTroveAndSnapshot(alice, "20,000", "150")
    await setupTroveAndSnapshot(bob, "20,000", "180")
    await setupTroveAndSnapshot(carol, "20,000", "2000")

    const rewardsFromL1 = await expectedRewardAmountForUsers(alice, users)
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

    const rewardsFromL2 = await expectedRewardAmountForUsers(bob, [
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

    const rewardsFromL3 = await expectedRewardAmountForUsers(frank, [
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
      await calculateSystemCollFromUsers([...users, dennis, eric, frank]),
      1000,
    )
  })
})
