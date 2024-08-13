import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import {
  CheckPoint,
  Contracts,
  ContractsState,
  TestSetup,
  TestingAddresses,
  User,
  connectContracts,
  createLiquidationEvent,
  fixture,
  getAddresses,
  openTrove,
  updateContractsSnapshot,
  updateMUSDUserSnapshot,
  updateTroveManagerSnapshot,
  updateTrovesSnapshot,
  updateStabilityPoolSnapshot,
  updateStabilityPoolUserSnapshot,
  updateStabilityPoolUserSnapshots,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("StabilityPool in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let whale: User
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
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    dennis = testSetup.users.dennis
    eric = testSetup.users.eric
    whale = testSetup.users.whale
    addresses = await getAddresses(contracts, testSetup.users)

    // Approve each user to deposit 100k to the stability pool.
    const amount = to1e18(100_000)
    await Promise.all(
      [alice, bob, carol, dennis, eric, whale].map(async (user) => {
        await contracts.musd
          .connect(user.wallet)
          .approve(addresses.stabilityPool, amount)
      }),
    )

    // set 1 BTC = $1000 for ease of math
    await contracts.mockAggregator.setPrice(to1e18(1_000))

    // Open a trove for $5k for alice backed by $10k worth of BTC (10 BTC)
    await openTrove(contracts, {
      musdAmount: "5,000",
      ICR: "200",
      sender: alice.wallet,
    })

    await openTrove(contracts, {
      musdAmount: "30,000",
      ICR: "200",
      sender: whale.wallet,
    })

    await contracts.stabilityPool
      .connect(whale.wallet)
      .provideToSP(to1e18(20_000))
  })

  describe("provideToSP()", () => {
    it("provideToSP(): increases the Stability Pool MUSD balance", async () => {
      const amount = to1e18(30)

      await updateStabilityPoolSnapshot(contracts, state, "before")
      await contracts.stabilityPool.connect(alice.wallet).provideToSP(amount)
      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before + amount,
      )
    })

    it("provideToSP(): updates the user's deposit record in StabilityPool", async () => {
      const amount = to1e18(200)
      await contracts.stabilityPool.connect(alice.wallet).provideToSP(amount)

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.deposit.after).to.be.equal(amount)
    })

    it("provideToSP(): reduces the user's MUSD balance", async () => {
      await updateMUSDUserSnapshot(contracts, alice, "before")

      const amount = to1e18(200)

      await contracts.stabilityPool.connect(alice.wallet).provideToSP(amount)

      await updateMUSDUserSnapshot(contracts, alice, "after")

      expect(alice.musd.after).to.equal(alice.musd.before - amount)
    })

    it("provideToSP(): Correctly updates user snapshots of accumulated rewards per unit staked", async () => {
      await createLiquidationEvent(contracts)

      await updateStabilityPoolSnapshot(contracts, state, "before")

      expect(state.stabilityPool.P.before).to.be.greaterThan(0n)
      expect(state.stabilityPool.S.before).to.be.greaterThan(0n)

      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      expect(alice.stabilityPool.P.before).to.equal(0n)
      expect(alice.stabilityPool.S.before).to.equal(0n)

      // Make deposit
      await contracts.stabilityPool
        .connect(alice.wallet)
        .provideToSP(to1e18(100))

      // Check 'After' snapshots
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.before)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.before)
    })

    it("provideToSP(): multiple deposits: updates user's deposit and snapshots", async () => {
      // Alice makes deposit #1: $1,000

      await contracts.stabilityPool
        .connect(alice.wallet)
        .provideToSP(to1e18(1_000))

      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      expect(alice.stabilityPool.P.before).to.equal(to1e18(1))
      expect(alice.stabilityPool.S.before).to.equal(0)

      await createLiquidationEvent(contracts)

      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      // Alice makes deposit #2
      const firstDepositAmount = to1e18(100)
      await contracts.stabilityPool
        .connect(alice.wallet)
        .provideToSP(firstDepositAmount)

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(
        alice.stabilityPool.compoundedDeposit.before + firstDepositAmount,
      ).to.equal(alice.stabilityPool.deposit.after)

      await updateStabilityPoolSnapshot(contracts, state, "after")

      // System rewards should change

      expect(state.stabilityPool.P.after).to.be.lessThan(to1e18(1))
      expect(state.stabilityPool.S.after).to.be.greaterThan(0n)

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.after)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.after)

      // Bob withdraws MUSD and deposits to StabilityPool

      await updateStabilityPoolSnapshot(contracts, state, "before")

      await openTrove(contracts, {
        musdAmount: "3,000",
        ICR: "200",
        sender: bob.wallet,
      })

      await contracts.stabilityPool.connect(bob.wallet).provideToSP(to1e18(427))

      // Trigger another liquidation
      await createLiquidationEvent(contracts)

      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.P.after).to.be.lessThan(
        state.stabilityPool.P.before,
      )
      expect(state.stabilityPool.S.after).to.be.greaterThan(
        state.stabilityPool.S.before,
      )

      // Alice makes deposit #3: $100
      await contracts.stabilityPool
        .connect(alice.wallet)
        .provideToSP(to1e18(100))

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.after)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.after)
    })

    it("provideToSP(): reverts if user tries to provide more than their MUSD balance", async () => {
      await updateMUSDUserSnapshot(contracts, alice, "before")

      await expect(
        contracts.stabilityPool
          .connect(alice.wallet)
          .provideToSP(alice.musd.before + 1n),
      ).to.be.reverted
    })

    it("provideToSP(): reverts if user tries to provide 2^256-1 MUSD, which exceeds their balance", async () => {
      // Alice attempts to deposit 2^256-1 MUSD
      const maxBytes32 = BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )

      await expect(
        contracts.stabilityPool.connect(alice.wallet).provideToSP(maxBytes32),
      ).to.be.reverted
    })

    context("No unexpected state changes", async () => {
      beforeEach(async () => {
        // Bob and Carol open troves and make Stability Pool deposits
        await Promise.all(
          [bob, carol].map(async (user) => {
            const amount = to1e18(5_000)
            await openTrove(contracts, {
              musdAmount: amount,
              ICR: "200",
              sender: user.wallet,
            })

            await contracts.stabilityPool
              .connect(user.wallet)
              .provideToSP(amount)
          }),
        )

        // Dennis opens a trove but does not make a Stability Pool deposit
        await openTrove(contracts, {
          musdAmount: "2,000",
          ICR: "200",
          sender: dennis.wallet,
        })

        await createLiquidationEvent(contracts)
      })

      it("provideToSP(): doesn't impact other users' deposits or collateral gains", async () => {
        const users = [alice, bob, carol]
        await updateStabilityPoolUserSnapshots(contracts, users, "before")

        // Dennis provides $1,000 to the stability pool.
        await contracts.stabilityPool
          .connect(dennis.wallet)
          .provideToSP(to1e18(1_000))

        expect(
          (
            await contracts.stabilityPool.getCompoundedMUSDDeposit(
              dennis.wallet,
            )
          ).toString(),
        ).to.equal(to1e18(1_000))

        await updateStabilityPoolUserSnapshots(contracts, users, "after")

        users.forEach((user) => {
          expect(user.stabilityPool.compoundedDeposit.before).to.equal(
            user.stabilityPool.compoundedDeposit.after,
          )
          expect(user.stabilityPool.collateralGain.before).to.equal(
            user.stabilityPool.collateralGain.after,
          )
        })
      })

      it("provideToSP(): doesn't impact system debt, collateral or TCR", async () => {
        type Pool = "activePool" | "defaultPool"
        const pools: Pool[] = ["activePool", "defaultPool"]
        const fetchState = async (checkPoint: CheckPoint) => {
          await Promise.all(
            pools.map((pool) =>
              updateContractsSnapshot(
                contracts,
                state,
                pool,
                checkPoint,
                addresses,
              ),
            ),
          )
          await updateTroveManagerSnapshot(contracts, state, checkPoint)
        }

        await fetchState("before")

        // Dennis provides $1,000 to the stability pool.
        await contracts.stabilityPool
          .connect(dennis.wallet)
          .provideToSP(to1e18(1_000))

        await fetchState("after")

        pools.forEach((pool) => {
          expect(state[pool].debt.before).to.equal(state[pool].debt.after)
          expect(state[pool].collateral.before).to.equal(
            state[pool].collateral.after,
          )
        })

        expect(state.troveManager.TCR.before).to.equal(
          state.troveManager.TCR.after,
        )
      })

      it("provideToSP(): doesn't impact any troves, including the caller's trove", async () => {
        const users = [whale, alice, bob, carol, dennis]

        await updateTrovesSnapshot(contracts, users, "before")

        // Dennis provides $1,000 to the stability pool.
        await contracts.stabilityPool
          .connect(dennis.wallet)
          .provideToSP(to1e18(1_000))

        await updateTrovesSnapshot(contracts, users, "after")

        users.forEach((user) => {
          expect(user.trove.collateral.before).to.equal(
            user.trove.collateral.after,
          )
          expect(user.trove.debt.before).to.equal(user.trove.debt.after)
          expect(user.trove.icr.before).to.equal(user.trove.icr.after)
        })
      })
    })

    it("provideToSP(): doesn't protect the depositor's trove from liquidation", async () => {
      await openTrove(contracts, {
        musdAmount: "2,000",
        ICR: "120",
        sender: bob.wallet,
      })

      await contracts.stabilityPool
        .connect(bob.wallet)
        .provideToSP(to1e18(2_000))

      // Price drops from $1,000 to $900
      await contracts.mockAggregator.setPrice(to1e18(900))

      // Liquidate bob
      await contracts.troveManager.liquidate(bob.wallet)

      // Check Bob's trove has been removed from the system
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(false)

      // check Bob's trove status was closed by liquidation
      expect(
        (await contracts.troveManager.getTroveStatus(bob.wallet)).toString(),
      ).to.equal("3")
    })

    it("provideToSP(): providing $0 reverts", async () => {
      await expect(contracts.stabilityPool.connect(bob.wallet).provideToSP(0n))
        .to.be.reverted
    })

    it("provideToSP(): new deposit; depositor does not receive collateral gains", async () => {
      await createLiquidationEvent(contracts)

      // Alice deposits to the Pool

      await contracts.stabilityPool
        .connect(alice.wallet)
        .provideToSP(to1e18(2_000))

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
    })

    it("provideToSP(): new deposit after past full withdrawal; depositor does not receive collateral gains", async () => {
      // Alice enters and then exits the pool
      const amount = to1e18(2_000)

      await contracts.stabilityPool.connect(alice.wallet).provideToSP(amount)

      await contracts.stabilityPool.connect(alice.wallet).withdrawFromSP(amount)

      await createLiquidationEvent(contracts)

      // Alice deposits to the Pool
      await contracts.stabilityPool.connect(alice.wallet).provideToSP(amount)

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
    })
  })
})
