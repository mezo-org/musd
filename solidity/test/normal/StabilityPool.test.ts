import { expect } from "chai"
import { ContractTransactionResponse } from "ethers"
import {
  CheckPoint,
  Contracts,
  ContractsState,
  NO_GAS,
  TestingAddresses,
  User,
  createLiquidationEvent,
  dropPrice,
  dropPriceAndLiquidate,
  getEmittedLiquidationValues,
  openTrove,
  openTroveAndProvideStability,
  openTroves,
  openTrovesAndProvideStability,
  provideToSP,
  setDefaultFees,
  setupTests,
  testUpdatesInterestOwed,
  testUpdatesSystemInterestOwed,
  transferMUSD,
  updateContractsSnapshot,
  updatePendingSnapshot,
  updatePendingSnapshots,
  updateStabilityPoolSnapshot,
  updateStabilityPoolUserSnapshot,
  updateStabilityPoolUserSnapshots,
  updateTroveManagerSnapshot,
  updateTroveSnapshot,
  updateTroveSnapshots,
  updateWalletSnapshot,
  withdrawCollateralGainToTrove,
  withdrawCollateralGainToTroves,
} from "../helpers"
import { to1e18 } from "../utils"
import { MAX_BYTES_32 } from "../../helpers/constants"

describe("StabilityPool in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let deployer: User
  let dennis: User
  let eric: User
  let treasury: User
  let whale: User
  let state: ContractsState
  let contracts: Contracts

  type Pool = "activePool" | "defaultPool"
  const pools: Pool[] = ["activePool", "defaultPool"]

  beforeEach(async () => {
    ;({
      alice,
      bob,
      carol,
      council,
      deployer,
      dennis,
      eric,
      treasury,
      whale,
      contracts,
      state,
      addresses,
    } = await setupTests())

    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()

    await setDefaultFees(contracts, council)

    await openTrove(contracts, {
      musdAmount: "5,000",
      ICR: "200",
      sender: alice.wallet,
    })

    await openTrove(contracts, {
      musdAmount: "300,000",
      ICR: "200",
      sender: whale.wallet,
    })
  })

  describe("provideToSP()", () => {
    const setupTroveAndLiquidation = async () => {
      // Bob and Carol open troves and make Stability Pool deposits
      await openTrovesAndProvideStability(
        contracts,
        [bob, carol],
        "5,000",
        "200",
      )

      // Dennis opens a trove but does not make a Stability Pool deposit
      await openTrove(contracts, {
        musdAmount: "2,000",
        ICR: "200",
        sender: dennis.wallet,
      })

      await createLiquidationEvent(contracts, deployer)
    }

    it("increases the Stability Pool mUSD balance", async () => {
      const amount = to1e18(30)

      await updateStabilityPoolSnapshot(contracts, state, "before")
      await provideToSP(contracts, alice, amount)
      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before + amount,
      )
    })

    it("updates the user's deposit record in StabilityPool", async () => {
      const amount = to1e18(200)
      await provideToSP(contracts, alice, amount)

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.deposit.after).to.be.equal(amount)
    })

    it("Correctly updates user snapshots of accumulated rewards per unit staked", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))
      await createLiquidationEvent(contracts, deployer)

      await updateStabilityPoolSnapshot(contracts, state, "before")

      expect(state.stabilityPool.P.before).to.be.greaterThan(0n)
      expect(state.stabilityPool.S.before).to.be.greaterThan(0n)

      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      expect(alice.stabilityPool.P.before).to.equal(0n)
      expect(alice.stabilityPool.S.before).to.equal(0n)

      // Make deposit
      await provideToSP(contracts, alice, to1e18(100))

      // Check 'After' snapshots
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.before)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.before)
    })

    // This test calls `provideToSP` multiple times and makes assertions after each time.
    // To accomplish this in our state framework, we overwrite `before` and `after` each time.
    it("multiple deposits: updates user's deposit and snapshots", async () => {
      // To make sure the pool does not get fully offset.
      await provideToSP(contracts, whale, to1e18("20,000"))

      // Alice makes deposit #1: $1,000
      await provideToSP(contracts, alice, to1e18("1,000"))

      await createLiquidationEvent(contracts, deployer)

      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      // Alice makes deposit #2
      const firstDepositAmount = to1e18(100)
      await provideToSP(contracts, alice, firstDepositAmount)

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

      // Bob withdraws mUSD and deposits to StabilityPool

      await openTrove(contracts, {
        musdAmount: "3,000",
        ICR: "200",
        sender: bob.wallet,
      })

      await updateStabilityPoolSnapshot(contracts, state, "before")

      await provideToSP(contracts, bob, to1e18(427))

      // Trigger another liquidation
      await createLiquidationEvent(contracts, deployer)

      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.P.after).to.be.lessThan(
        state.stabilityPool.P.before,
      )
      expect(state.stabilityPool.S.after).to.be.greaterThan(
        state.stabilityPool.S.before,
      )

      await updateStabilityPoolSnapshot(contracts, state, "before")

      // Alice makes deposit #3: $100
      await provideToSP(contracts, alice, to1e18(100))

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.before)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.before)
    })

    it("doesn't impact other users' deposits or collateral gains", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))

      await setupTroveAndLiquidation()
      const users = [alice, bob, carol]
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      // Dennis provides $1,000 to the stability pool.
      await provideToSP(contracts, dennis, to1e18("1,000"))

      expect(
        (
          await contracts.stabilityPool.getCompoundedMUSDDeposit(dennis.wallet)
        ).toString(),
      ).to.equal(to1e18("1,000"))

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

    it("new deposit; depositor does not receive collateral gains", async () => {
      await createLiquidationEvent(contracts, deployer)

      // Alice deposits to the Pool

      await provideToSP(contracts, alice, to1e18("2,000"))

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
    })

    it("new deposit after past full withdrawal; depositor does not receive collateral gains", async () => {
      // Alice enters and then exits the pool
      const amount = to1e18("2,000")

      await provideToSP(contracts, alice, amount)

      await contracts.stabilityPool.connect(alice.wallet).withdrawFromSP(amount)

      await createLiquidationEvent(contracts, deployer)

      // Alice deposits to the Pool
      await provideToSP(contracts, alice, amount)

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
    })

    it("doesn't impact any troves, including the caller's trove", async () => {
      await setupTroveAndLiquidation()
      const users = [whale, alice, bob, carol, dennis]

      await updateTroveSnapshots(contracts, users, "before")

      // Dennis provides $1,000 to the stability pool.
      await provideToSP(contracts, dennis, to1e18("1,000"))

      await updateTroveSnapshots(contracts, users, "after")

      users.forEach((user) => {
        expect(user.trove.collateral.before).to.equal(
          user.trove.collateral.after,
        )
        expect(user.trove.debt.before).to.equal(user.trove.debt.after)
        expect(user.trove.icr.before).to.equal(user.trove.icr.after)
      })
    })

    it("doesn't protect the depositor's trove from liquidation", async () => {
      await openTrove(contracts, {
        musdAmount: "2,000",
        ICR: "120",
        sender: bob.wallet,
      })

      await provideToSP(contracts, bob, to1e18("2,000"))

      await dropPrice(contracts, deployer, bob)

      // Liquidate bob
      await contracts.troveManager.liquidate(bob.wallet)

      // Check Bob's trove has been removed from the system
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(false)

      // check Bob's trove status was closed by liquidation
      expect(
        (await contracts.troveManager.getTroveStatus(bob.wallet)).toString(),
      ).to.equal("3")
    })

    it("reduces the user's mUSD balance", async () => {
      await updateWalletSnapshot(contracts, alice, "before")

      const amount = to1e18(200)

      await provideToSP(contracts, alice, amount)

      await updateWalletSnapshot(contracts, alice, "after")

      expect(alice.musd.after).to.equal(alice.musd.before - amount)
    })

    it("doesn't impact system debt, collateral or TCR", async () => {
      await setupTroveAndLiquidation()
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
      await provideToSP(contracts, dennis, to1e18("1,000"))

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

    context("Expected Reverts", () => {
      it("reverts if user tries to provide more than their mUSD balance", async () => {
        await updateWalletSnapshot(contracts, alice, "before")

        await expect(provideToSP(contracts, alice, alice.musd.before + 1n)).to
          .be.reverted
      })

      it("reverts if user tries to provide 2^256-1 mUSD, which exceeds their balance", async () => {
        // Alice attempts to deposit 2^256-1 MUSD
        await expect(provideToSP(contracts, alice, MAX_BYTES_32)).to.be.reverted
      })

      it("providing $0 reverts", async () => {
        await expect(provideToSP(contracts, alice, 0n)).to.be.reverted
      })
    })
  })

  describe("withdrawFromSP()", () => {
    let liquidationTx: ContractTransactionResponse

    const setupPartialRetrieval = async () => {
      await provideToSP(contracts, alice, to1e18("5,000"))

      await updateStabilityPoolUserSnapshots(
        contracts,
        [alice, whale],
        "before",
      )
      await updateStabilityPoolSnapshot(contracts, state, "before")

      liquidationTx = await createLiquidationEvent(contracts, deployer)

      await updateWalletSnapshot(contracts, alice, "before")

      // Retrive $900
      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(900), NO_GAS)

      await updateStabilityPoolSnapshot(contracts, state, "after")
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")
      await updateWalletSnapshot(contracts, alice, "after")
    }

    it("leaves the correct amount of mUSD in the Stability Pool", async () => {
      await setupPartialRetrieval()
      const { liquidatedPrincipal } =
        await getEmittedLiquidationValues(liquidationTx)

      const expectedMUSD =
        state.stabilityPool.musd.before -
        to1e18(900) - // alice withdrew $900
        liquidatedPrincipal

      expect(state.stabilityPool.musd.after).to.equal(expectedMUSD)
    })

    it("full retrieval - leaves the correct amount of mUSD in the Stability Pool", async () => {
      await provideToSP(contracts, alice, to1e18("5,000"))

      await updateStabilityPoolUserSnapshots(
        contracts,
        [alice, whale],
        "before",
      )
      await updateStabilityPoolSnapshot(contracts, state, "before")

      const tx = await createLiquidationEvent(contracts, deployer)

      const { liquidatedPrincipal } = await getEmittedLiquidationValues(tx)

      const expectedMUSDLoss =
        (liquidatedPrincipal * alice.stabilityPool.deposit.before) /
        (alice.stabilityPool.deposit.before +
          whale.stabilityPool.deposit.before)

      // fully withdraw
      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(alice.stabilityPool.deposit.before, NO_GAS)

      await updateStabilityPoolSnapshot(contracts, state, "after")

      const aliceRemainingDeposit =
        alice.stabilityPool.deposit.before - expectedMUSDLoss

      expect(state.stabilityPool.musd.after).to.be.closeTo(
        state.stabilityPool.musd.before -
          liquidatedPrincipal -
          aliceRemainingDeposit,
        5000n,
      )
    })

    it("it correctly updates the user's mUSD and collateral snapshots of entitled reward per unit staked", async () => {
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts, deployer)
      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(900))

      await updateStabilityPoolSnapshot(contracts, state, "after")
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.after)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.after)
    })

    it("decreases StabilityPool collateral", async () => {
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts, deployer)

      await updateStabilityPoolSnapshot(contracts, state, "before")
      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(900))

      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.collateral.after).to.equal(
        state.stabilityPool.collateral.before -
          alice.stabilityPool.collateralGain.before,
      )
    })

    it("All depositors are able to withdraw from the SP to their account", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts, deployer)

      const users = [alice, whale]
      await Promise.all(
        users.map(async (user) => {
          await updateStabilityPoolUserSnapshot(contracts, user, "before")
          await contracts.stabilityPool
            .connect(user.wallet)
            .withdrawFromSP(user.stabilityPool.compoundedDeposit.before)
          await updateStabilityPoolUserSnapshot(contracts, user, "after")
        }),
      )
      await updateStabilityPoolSnapshot(contracts, state, "after")

      users.forEach((user) =>
        expect(user.stabilityPool.compoundedDeposit.after).to.equal(0n),
      )
      expect(state.stabilityPool.musd.after).to.be.closeTo(0n, 20000n)
    })

    it("doesn't impact other users deposits or collateral gains", async () => {
      await provideToSP(contracts, alice, to1e18("3,000"))
      await openTrovesAndProvideStability(
        contracts,
        [bob, carol],
        "5,000",
        "200",
      )

      await createLiquidationEvent(contracts, deployer)

      await updateStabilityPoolUserSnapshots(contracts, [bob, carol], "before")

      // Alice withdraws from the Stability Pool
      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(1000))

      await updateStabilityPoolUserSnapshots(contracts, [bob, carol], "after")

      // Check that Bob and Carol's deposits and collateral gains haven't changed
      ;[bob, carol].forEach((user) => {
        expect(user.stabilityPool.deposit.after).to.equal(
          user.stabilityPool.deposit.before,
        )
        expect(user.stabilityPool.collateralGain.after).to.equal(
          user.stabilityPool.collateralGain.before,
        )
      })
    })

    it("succeeds when amount is 0 and system has an undercollateralized trove", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))
      await createLiquidationEvent(contracts, deployer)

      await openTrove(contracts, {
        musdAmount: "2,000", // slightly over the minimum of $1800
        ICR: "120", // 120%
        sender: bob.wallet,
      })

      await dropPrice(contracts, deployer, bob)

      await updateStabilityPoolUserSnapshot(contracts, whale, "before")
      await updateWalletSnapshot(contracts, whale, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(0n, NO_GAS)

      await updateStabilityPoolUserSnapshot(contracts, whale, "after")
      await updateWalletSnapshot(contracts, whale, "after")

      expect(whale.musd.after).to.equal(whale.musd.before)
      expect(whale.btc.after).to.equal(
        whale.btc.before + whale.stabilityPool.collateralGain.before,
      )
      expect(whale.stabilityPool.compoundedDeposit.after).to.equal(
        whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.stabilityPool.collateralGain.after).to.equal(0n)
    })

    it("withdrawing 0 mUSD doesn't alter the caller's deposit or the total mUSD in the Stability Pool", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))
      await createLiquidationEvent(contracts, deployer)

      await updateStabilityPoolUserSnapshot(contracts, whale, "before")
      await updateStabilityPoolSnapshot(contracts, state, "before")

      await contracts.stabilityPool.connect(whale.wallet).withdrawFromSP(0n)

      await updateStabilityPoolUserSnapshot(contracts, whale, "after")
      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(whale.stabilityPool.compoundedDeposit.after).to.equal(
        whale.stabilityPool.compoundedDeposit.before,
      )
      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before,
      )
    })

    it("doesn't impact any troves, including the caller's trove", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))

      await openTroves(contracts, [bob, carol], "5,000", "200")

      await createLiquidationEvent(contracts, deployer)

      const users = [alice, bob, carol, whale]
      await updateTroveSnapshots(contracts, users, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(to1e18("3,000"))

      await updateTroveSnapshots(contracts, users, "after")

      users.forEach((user) => {
        expect(user.trove.collateral.after).to.equal(
          user.trove.collateral.before,
        )
        expect(user.trove.debt.after).to.equal(user.trove.debt.before)
        expect(user.trove.icr.after).to.equal(user.trove.icr.before)
      })
    })

    it("retrieves correct mUSD amount and the entire collateral Gain, and updates deposit", async () => {
      await setupPartialRetrieval()
      const { liquidatedPrincipal, liquidatedColl } =
        await getEmittedLiquidationValues(liquidationTx)

      const expectedMUSDLoss =
        (liquidatedPrincipal * alice.stabilityPool.deposit.before) /
        (alice.stabilityPool.deposit.before +
          whale.stabilityPool.deposit.before)

      const expectedCollateralGain =
        (liquidatedColl * alice.stabilityPool.deposit.before) /
        (alice.stabilityPool.deposit.before +
          whale.stabilityPool.deposit.before)
      expect(alice.musd.after).to.equal(alice.musd.before + to1e18(900))
      expect(alice.btc.after - alice.btc.before).to.equal(
        expectedCollateralGain,
      )

      expect(alice.stabilityPool.deposit.after).to.be.closeTo(
        alice.stabilityPool.deposit.before - to1e18(900) - expectedMUSDLoss,
        5000n,
      )

      expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
    })

    it("Subsequent deposit and withdrawal attempt from same account, with no intermediate liquidations, withdraws zero collateral", async () => {
      await provideToSP(contracts, alice, to1e18("5,000"))

      await createLiquidationEvent(contracts, deployer)

      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(900), NO_GAS)

      await updateWalletSnapshot(contracts, alice, "before")

      await provideToSP(contracts, alice, to1e18(900))
      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(900), NO_GAS)

      await updateWalletSnapshot(contracts, alice, "after")
      expect(alice.btc.after).to.equal(alice.btc.before)
    })

    it("increases depositor's mUSD token balance by the expected amount", async () => {
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts, deployer)

      await updateWalletSnapshot(contracts, alice, "before")
      await updateStabilityPoolUserSnapshot(contracts, alice, "before")

      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(alice.stabilityPool.compoundedDeposit.before)

      await updateWalletSnapshot(contracts, alice, "after")

      expect(alice.musd.after).to.equal(
        alice.musd.before + alice.stabilityPool.compoundedDeposit.before,
      )
    })

    it("withdrawing 0 collateral Gain does not alter the caller's collateral balance, their trove collateral, or the collateral in the Stability Pool", async () => {
      await createLiquidationEvent(contracts, deployer)

      const amount = to1e18("3,000")
      await provideToSP(contracts, alice, amount)

      await updateTroveSnapshot(contracts, alice, "before")
      await updateWalletSnapshot(contracts, alice, "before")
      await updateStabilityPoolSnapshot(contracts, state, "before")

      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(amount, NO_GAS)

      await updateTroveSnapshot(contracts, alice, "after")
      await updateWalletSnapshot(contracts, alice, "after")
      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(alice.btc.after).to.equal(alice.btc.before)
      expect(alice.trove.collateral.after).to.equal(
        alice.trove.collateral.before,
      )
      expect(state.stabilityPool.collateral.after).to.equal(
        state.stabilityPool.collateral.before,
      )
    })

    it("Requests to withdraw amounts greater than the caller's compounded deposit only withdraws the caller's compounded deposit", async () => {
      const amount = to1e18("20,000")
      await provideToSP(contracts, whale, amount)
      await updateStabilityPoolSnapshot(contracts, state, "before")
      await updateWalletSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(whale.stabilityPool.compoundedDeposit.before + amount)

      await updateStabilityPoolSnapshot(contracts, state, "after")
      await updateWalletSnapshot(contracts, whale, "after")
      await updateStabilityPoolUserSnapshot(contracts, whale, "after")

      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before -
          whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.musd.after).to.equal(
        whale.musd.before + whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.stabilityPool.compoundedDeposit.after).to.equal(0n)
    })

    it("Request to withdraw 2^256-1 mUSD only withdraws the caller's compounded deposit", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))

      await updateStabilityPoolSnapshot(contracts, state, "before")
      await updateWalletSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(MAX_BYTES_32)

      await updateStabilityPoolSnapshot(contracts, state, "after")
      await updateWalletSnapshot(contracts, whale, "after")
      await updateStabilityPoolUserSnapshot(contracts, whale, "after")

      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before -
          whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.musd.after).to.equal(
        whale.musd.before + whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.stabilityPool.compoundedDeposit.after).to.equal(0n)
    })

    context("compounded deposit and collateral Gain", () => {
      const setupIdenticalDeposits = async () => {
        const users = [bob, carol, dennis]
        await openTrovesAndProvideStability(contracts, users, "5,000", "200")
      }

      const setupVaryingDeposits = async () => {
        const usersAndAmounts: { user: User; amount: bigint }[] = [
          { user: bob, amount: to1e18("10,000") },
          { user: carol, amount: to1e18("20,000") },
          { user: dennis, amount: to1e18("30,000") },
        ]

        await Promise.all(
          usersAndAmounts.map(async ({ user, amount }) => {
            await openTrove(contracts, {
              musdAmount: amount,
              ICR: "200",
              sender: user.wallet,
            })
            await provideToSP(contracts, user, amount)
          }),
        )
      }

      const verify = async () => {
        const users = [bob, carol, dennis]
        await updateStabilityPoolUserSnapshots(contracts, users, "before")
        await Promise.all(
          users.map((user) => updateWalletSnapshot(contracts, user, "before")),
        )

        await Promise.all(
          users.map((user) =>
            contracts.stabilityPool
              .connect(user.wallet)
              .withdrawFromSP(to1e18("500,000"), NO_GAS),
          ),
        )

        await updateStabilityPoolUserSnapshots(contracts, users, "after")
        await Promise.all(
          users.map((user) => updateWalletSnapshot(contracts, user, "after")),
        )

        users.forEach((user) => {
          expect(user.stabilityPool.collateralGain.after).to.equal(0n)
          expect(user.btc.after).to.equal(
            user.btc.before + user.stabilityPool.collateralGain.before,
          )
          expect(user.musd.after).to.equal(
            user.musd.before + user.stabilityPool.compoundedDeposit.before,
          )
        })
      }

      it("Depositors with equal initial deposit withdraw correct compounded deposit and collateral Gain after one liquidation", async () => {
        await setupIdenticalDeposits()
        await createLiquidationEvent(contracts, deployer)
        await verify()
      })

      it("Depositors with equal initial deposit withdraw correct compounded deposit and collateral Gain after two identical liquidations", async () => {
        await setupIdenticalDeposits()
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer)
        await verify()
      })

      it("Depositors with equal initial deposit withdraw correct compounded deposit and collateral Gain after three identical liquidations", async () => {
        await setupIdenticalDeposits()
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer)
        await verify()
      })

      it("Depositors with equal initial deposit withdraw correct compounded deposit and collateral Gain after two liquidations of increasing mUSD", async () => {
        await setupIdenticalDeposits()
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer, "3,000")
        await verify()
      })

      it("Depositors with equal initial deposit withdraw correct compounded deposit and collateral Gain after three liquidations of increasing mUSD", async () => {
        await setupIdenticalDeposits()
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer, "3,000")
        await createLiquidationEvent(contracts, deployer, "5,000")
        await verify()
      })

      it("Depositors with varying deposits withdraw correct compounded deposit and collateral Gain after two identical liquidations", async () => {
        await setupVaryingDeposits()
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer)
        await verify()
      })

      it("Depositors with varying deposits withdraw correct compounded deposit and collateral Gain after three identical liquidations", async () => {
        await setupVaryingDeposits()
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer)
        await verify()
      })

      it("Depositors with varying deposits withdraw correct compounded deposit and collateral Gain after three varying liquidations", async () => {
        await setupVaryingDeposits()
        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer, "3,000")
        await createLiquidationEvent(contracts, deployer, "6,000")
        await verify()
      })

      it("Bob and Carol deposit -> 2 liquidations -> Dennis deposits -> 2 liquidations. Various deposit and liquidation vals.", async () => {
        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: bob.wallet,
        })
        await provideToSP(contracts, bob, to1e18("10,000"))

        await openTrove(contracts, {
          musdAmount: "20,000",
          ICR: "200",
          sender: carol.wallet,
        })
        await provideToSP(contracts, carol, to1e18("20,000"))

        await createLiquidationEvent(contracts, deployer)
        await createLiquidationEvent(contracts, deployer, "4,000")

        await openTrove(contracts, {
          musdAmount: "30,000",
          ICR: "200",
          sender: dennis.wallet,
        })
        await provideToSP(contracts, dennis, to1e18("30,000"))

        await createLiquidationEvent(contracts, deployer, "7,000")
        await createLiquidationEvent(contracts, deployer, "9,000")

        await verify()
      })

      it("Bob, Carol, Dennis deposit -> 2 liquidations -> Eric deposits -> 2 liquidations. All deposits and liquidations = 10,000 mUSD.", async () => {
        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: bob.wallet,
        })
        await provideToSP(contracts, bob, to1e18("10,000"))

        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: carol.wallet,
        })
        await provideToSP(contracts, carol, to1e18("10,000"))

        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: dennis.wallet,
        })
        await provideToSP(contracts, dennis, to1e18("10,000"))

        await createLiquidationEvent(contracts, deployer, "10,000")
        await createLiquidationEvent(contracts, deployer, "10,000")

        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: eric.wallet,
        })
        await provideToSP(contracts, eric, to1e18("10,000"))

        await createLiquidationEvent(contracts, deployer, "10,000")
        await createLiquidationEvent(contracts, deployer, "10,000")

        await verify()
      })

      it("Bob, Carol, Dennis deposit -> 2 liquidations -> Dennis withdraws -> 2 liquidations. All deposits and liquidations = 2,000 mUSD.", async () => {
        const users = [bob, carol, dennis]
        const amount = "2,000"

        await openTrovesAndProvideStability(contracts, users, amount, "200")

        await createLiquidationEvent(contracts, deployer, amount)
        await createLiquidationEvent(contracts, deployer, amount)

        await contracts.stabilityPool
          .connect(dennis.wallet)
          .withdrawFromSP(to1e18(amount))

        await createLiquidationEvent(contracts, deployer, amount)
        await createLiquidationEvent(contracts, deployer, amount)

        await updateStabilityPoolUserSnapshots(contracts, users, "before")
        await Promise.all(
          users.map((user) => updateWalletSnapshot(contracts, user, "before")),
        )

        // Dennis already withdrew
        await Promise.all(
          [bob, carol].map((user) =>
            contracts.stabilityPool
              .connect(user.wallet)
              .withdrawFromSP(to1e18("500,000"), NO_GAS),
          ),
        )

        await updateStabilityPoolUserSnapshots(contracts, users, "after")
        await Promise.all(
          users.map((user) => updateWalletSnapshot(contracts, user, "after")),
        )

        users.forEach((user) => {
          expect(user.stabilityPool.collateralGain.after).to.equal(0n)
          expect(user.btc.after).to.equal(
            user.btc.before + user.stabilityPool.collateralGain.before,
          )
          expect(user.musd.after).to.equal(
            user.musd.before + user.stabilityPool.compoundedDeposit.before,
          )
        })
      })

      it("Depositor withdraws correct compounded deposit after liquidation empties the pool", async () => {
        const amount = "20,000"
        await provideToSP(contracts, whale, to1e18(amount))
        await createLiquidationEvent(contracts, deployer, amount)

        await updateWalletSnapshot(contracts, whale, "before")
        await updateStabilityPoolUserSnapshot(contracts, whale, "before")

        // Withdraw everything
        await contracts.stabilityPool
          .connect(whale.wallet)
          .withdrawFromSP(to1e18("500,000"), NO_GAS)

        await updateWalletSnapshot(contracts, whale, "after")
        await updateStabilityPoolUserSnapshot(contracts, whale, "after")

        expect(whale.stabilityPool.compoundedDeposit.before).to.equal(0n)
        expect(whale.stabilityPool.collateralGain.after).to.equal(0n)
        expect(whale.btc.after).to.equal(
          whale.btc.before + whale.stabilityPool.collateralGain.before,
        )
        expect(whale.musd.after).to.equal(whale.musd.before)
      })
    })

    it("Single deposit fully offset. After a subsequent liquidation, depositor withdraws 0 musd and the collateral Gain from one liquidation", async () => {
      const amount = "20,000"
      await provideToSP(contracts, whale, to1e18(amount))
      // Fully offset the whale's $20k deposit
      await createLiquidationEvent(contracts, deployer, amount)

      await updateWalletSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")

      // Subsequent liquidation
      await createLiquidationEvent(contracts, deployer, "10,000")

      // The whale withdraws everything
      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(to1e18("500,000"), NO_GAS)

      await updateWalletSnapshot(contracts, whale, "after")
      await updateStabilityPoolUserSnapshot(contracts, whale, "after")

      expect(whale.musd.after).to.equal(whale.musd.before)
      expect(whale.stabilityPool.compoundedDeposit.before).to.equal(0n)
      expect(whale.stabilityPool.deposit.after).to.equal(0n)
      expect(whale.btc.after).to.equal(
        whale.btc.before + whale.stabilityPool.collateralGain.before,
      )
    })

    it("deposit spans one scale factor change: Single depositor withdraws correct compounded deposit and collateral Gain after one liquidation", async () => {
      // Add just enough mUSD to increase the scale
      await provideToSP(contracts, whale, to1e18("10250") + 500000n)

      await createLiquidationEvent(contracts, deployer, "10,000")

      await updateStabilityPoolUserSnapshot(contracts, whale, "before")
      await updateWalletSnapshot(contracts, whale, "before")
      await updateStabilityPoolSnapshot(contracts, state, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(to1e18("10,000"), NO_GAS)

      await updateStabilityPoolUserSnapshot(contracts, whale, "after")
      await updateWalletSnapshot(contracts, whale, "after")

      expect(state.stabilityPool.currentScale.before).to.equal(1n)
      expect(whale.musd.after).to.equal(whale.musd.before)
      expect(whale.stabilityPool.compoundedDeposit.before).to.equal(0n)
      expect(whale.stabilityPool.deposit.after).to.equal(0n)
      expect(whale.btc.after).to.equal(
        whale.btc.before + whale.stabilityPool.collateralGain.before,
      )
    })

    it("Several deposits of varying amounts span one scale factor change. Depositors withdraw correct compounded deposit and collateral Gain after one liquidation", async () => {
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "200",
        sender: bob.wallet,
      })
      await provideToSP(contracts, bob, to1e18("10,000"))

      await openTrove(contracts, {
        musdAmount: "20,000",
        ICR: "200",
        sender: carol.wallet,
      })
      await provideToSP(contracts, carol, to1e18("20,000"))

      // Just enough left over to increase the scale
      const dennisAmount = to1e18("30,500") + 500000n
      await openTrove(contracts, {
        musdAmount: dennisAmount,
        ICR: "200",
        sender: dennis.wallet,
      })
      await provideToSP(contracts, dennis, dennisAmount)

      await createLiquidationEvent(contracts, deployer, "60,000")

      const users = [bob, carol, dennis]
      await updateStabilityPoolSnapshot(contracts, state, "before")
      await Promise.all(
        users.map(async (user) => {
          await updateStabilityPoolUserSnapshot(contracts, user, "before")
          await updateWalletSnapshot(contracts, user, "before")
        }),
      )

      await Promise.all(
        users.map((user) =>
          contracts.stabilityPool
            .connect(user.wallet)
            .withdrawFromSP(to1e18("500,000"), NO_GAS),
        ),
      )

      await Promise.all(
        users.map(async (user) => {
          await updateStabilityPoolUserSnapshot(contracts, user, "after")
          await updateWalletSnapshot(contracts, user, "after")
        }),
      )

      users.forEach((user) => {
        expect(user.musd.after).to.equal(user.musd.before)
        expect(user.stabilityPool.compoundedDeposit.before).to.equal(0n)
        expect(user.stabilityPool.deposit.after).to.equal(0n)
        expect(user.btc.after).to.equal(
          user.btc.before + user.stabilityPool.collateralGain.before,
        )
      })
      expect(state.stabilityPool.currentScale.before).to.equal(1n)
    })

    it("Deposit that decreases to less than 1e-9 of it's original value is reduced to 0", async () => {
      const amount = "10,000"
      await provideToSP(contracts, whale, to1e18(amount) + 10n)

      await createLiquidationEvent(contracts, deployer, amount)

      await updateWalletSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(to1e18(amount), NO_GAS)

      await updateWalletSnapshot(contracts, whale, "after")

      expect(whale.musd.after).to.equal(whale.musd.before)
      expect(whale.stabilityPool.compoundedDeposit.before).to.equal(0n)
    })

    it("2 depositors can withdraw after each receiving half of a pool-emptying liquidation", async () => {
      const users = [bob, carol]

      await openTrovesAndProvideStability(contracts, users, "10,000", "200")

      await createLiquidationEvent(contracts, deployer, "30,000")

      await updateStabilityPoolUserSnapshots(contracts, users, "before")
      await updateWalletSnapshot(contracts, bob, "before")
      await updateWalletSnapshot(contracts, carol, "before")

      await Promise.all(
        users.map((user) =>
          contracts.stabilityPool
            .connect(user.wallet)
            .withdrawFromSP(to1e18("20,000"), NO_GAS),
        ),
      )

      await updateStabilityPoolUserSnapshots(contracts, users, "after")
      await updateWalletSnapshot(contracts, bob, "after")
      await updateWalletSnapshot(contracts, carol, "after")

      users.forEach((user) => {
        expect(user.stabilityPool.compoundedDeposit.before).to.equal(0n)
        expect(user.stabilityPool.collateralGain.before).to.be.greaterThan(0n)

        expect(user.stabilityPool.compoundedDeposit.after).to.equal(0n)
        expect(user.stabilityPool.collateralGain.after).to.equal(0n)

        expect(user.musd.after).to.equal(user.musd.before)
        expect(user.btc.after).to.equal(
          user.btc.before + user.stabilityPool.collateralGain.before,
        )
      })
    })

    it("Large liquidated coll/debt, deposits and BTC price", async () => {
      // collateral:USD price is $2 billion per BTC
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice(2n * 10n ** 27n)

      const users = [bob, carol]
      const amount = 1n * 10n ** 27n // $ 1 billion
      await openTrovesAndProvideStability(contracts, users, amount, "200")

      await createLiquidationEvent(contracts, deployer, amount)

      await updateStabilityPoolUserSnapshots(contracts, users, "before")
      await Promise.all(
        users.map(async (user) => {
          await updateWalletSnapshot(contracts, user, "before")
        }),
      )

      await Promise.all(
        users.map((user) =>
          contracts.stabilityPool
            .connect(user.wallet)
            .withdrawFromSP(amount, NO_GAS),
        ),
      )

      await updateStabilityPoolUserSnapshots(contracts, users, "after")
      await Promise.all(
        users.map(async (user) => {
          await updateWalletSnapshot(contracts, user, "after")
        }),
      )

      users.forEach((user) => {
        expect(user.stabilityPool.compoundedDeposit.after).to.equal(0n)
        expect(user.stabilityPool.collateralGain.after).to.equal(0n)

        expect(user.musd.after).to.equal(
          user.musd.before + user.stabilityPool.compoundedDeposit.before,
        )
        expect(user.btc.after).to.equal(
          user.btc.before + user.stabilityPool.collateralGain.before,
        )
      })
    })

    it("doesn't impact system debt, collateral or TCR ", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))
      await createLiquidationEvent(contracts, deployer)

      await updateTroveManagerSnapshot(contracts, state, "before")
      await Promise.all(
        pools.map((pool) =>
          updateContractsSnapshot(contracts, state, pool, "before", addresses),
        ),
      )

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(to1e18("3,000"))

      await updateTroveManagerSnapshot(contracts, state, "after")
      await Promise.all(
        pools.map((pool) =>
          updateContractsSnapshot(contracts, state, pool, "after", addresses),
        ),
      )

      expect(state.activePool.collateral.after).to.equal(
        state.activePool.collateral.before,
      )
      expect(state.activePool.debt.after).to.equal(state.activePool.debt.before)
      expect(state.defaultPool.collateral.after).to.equal(
        state.defaultPool.collateral.before,
      )
      expect(state.defaultPool.debt.after).to.equal(
        state.defaultPool.debt.before,
      )
      expect(state.troveManager.TCR.after).to.equal(
        state.troveManager.TCR.before,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when user has no active deposit", async () => {
        await expect(
          contracts.stabilityPool.connect(alice.wallet).withdrawFromSP(1n),
        ).to.be.revertedWith("StabilityPool: User must have a non-zero deposit")
      })

      it("reverts when amount > 0 and system has an undercollateralized trove", async () => {
        // Open a barely-collateralized trove for Bob.
        await openTrove(contracts, {
          musdAmount: "2000",
          ICR: "120",
          sender: bob.wallet,
        })

        await dropPrice(contracts, deployer, bob)

        await expect(
          contracts.stabilityPool.connect(whale.wallet).withdrawFromSP(1n),
        ).to.be.revertedWith(
          "StabilityPool: Cannot withdraw while there are troves with ICR < MCR",
        )
      })
    })
  })

  describe("withdrawCollateralGainToTrove()", () => {
    let users: User[] = []
    beforeEach(() => {
      users = [bob, carol, dennis]
    })

    it("updates the Trove's interest owed", async () => {
      await testUpdatesInterestOwed(contracts, carol, council, async () => {
        await provideToSP(contracts, carol, to1e18("20,000"))
        await createLiquidationEvent(contracts, deployer)
        return withdrawCollateralGainToTrove(contracts, carol)
      })
    })

    it("updates the system interest", async () => {
      await testUpdatesSystemInterestOwed(
        contracts,
        state,
        addresses,
        carol,
        dennis,
        council,
        async () => {
          await provideToSP(contracts, carol, to1e18("20,000"))
          await dropPriceAndLiquidate(contracts, deployer, alice)
          return withdrawCollateralGainToTrove(contracts, carol)
        },
      )
    })

    it("decreases StabilityPool collateral and increases activePool collateral", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))

      await createLiquidationEvent(contracts, deployer)

      await updateStabilityPoolSnapshot(contracts, state, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      await withdrawCollateralGainToTrove(contracts, whale)

      await updateStabilityPoolSnapshot(contracts, state, "after")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.stabilityPool.collateral.after).to.equal(
        state.stabilityPool.collateral.before -
          whale.stabilityPool.collateralGain.before,
      )
      expect(state.activePool.collateral.after).to.equal(
        state.activePool.collateral.before +
          whale.stabilityPool.collateralGain.before,
      )
    })

    const expectCorrectCollateralGain = (user: User) => {
      expect(user.stabilityPool.deposit.after).to.equal(
        user.stabilityPool.compoundedDeposit.before,
      )
      expect(user.stabilityPool.collateralGain.after).to.equal(0n)
      expect(user.trove.collateral.after).to.equal(
        user.trove.collateral.before + user.stabilityPool.collateralGain.before,
      )
    }

    it("Applies MUSDLoss to user's deposit, and redirects collateral reward to user's Trove", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))

      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")

      await withdrawCollateralGainToTrove(contracts, whale)

      await updateTroveSnapshot(contracts, whale, "after")
      await updateStabilityPoolUserSnapshot(contracts, whale, "after")

      expectCorrectCollateralGain(whale)
    })

    it("All depositors are able to withdraw their collateral gain from the SP to their Trove", async () => {
      await openTrovesAndProvideStability(contracts, users, "5,000", "200")

      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      users.forEach((user) => {
        expectCorrectCollateralGain(user)
      })
    })

    const expectCorrectCollateralGainWithEqualDeposits = () =>
      users.forEach((user) => {
        expectCorrectCollateralGain(user)
        expect(user.trove.collateral.after).to.equal(
          users[0].trove.collateral.after,
        )
      })

    it("Depositors with equal initial deposit withdraw correct collateral Gain after one liquidation", async () => {
      await openTrovesAndProvideStability(contracts, users, "10,000", "200")

      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithEqualDeposits()
    })

    it("Depositors with equal initial deposit withdraw correct collateral Gain after three identical liquidations", async () => {
      await openTrovesAndProvideStability(contracts, users, "10,000", "200")

      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithEqualDeposits()
    })

    it("Depositors with equal initial deposit withdraw correct collateral Gain after two liquidations of increasing mUSD", async () => {
      await openTrovesAndProvideStability(contracts, users, "10,000", "200")

      await createLiquidationEvent(contracts, deployer, "5,000")
      await createLiquidationEvent(contracts, deployer, "8,000")
      await createLiquidationEvent(contracts, deployer, "11,000")

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithEqualDeposits()
    })

    const expectCorrectCollateralGainWithVaryingDeposits = () =>
      users.forEach((user, i) => {
        expectCorrectCollateralGain(user)

        // Each subsequent user deposited more, and so should receive more collateral
        if (i < users.length - 1) {
          expect(users[i].trove.collateral.after).to.be.lessThan(
            users[i + 1].trove.collateral.after,
          )
        }
      })

    it("Depositors with varying deposits withdraw correct collateral Gain after two identical liquidations", async () => {
      await openTroveAndProvideStability(contracts, bob, "10,000", "200")
      await openTroveAndProvideStability(contracts, carol, "20,000", "200")
      await openTroveAndProvideStability(contracts, dennis, "30,000", "200")

      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithVaryingDeposits()
    })

    it("Depositors with varying deposits withdraw correct collateral Gain after three identical liquidations", async () => {
      await openTroveAndProvideStability(contracts, bob, "10,000", "200")
      await openTroveAndProvideStability(contracts, carol, "20,000", "200")
      await openTroveAndProvideStability(contracts, dennis, "30,000", "200")

      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithVaryingDeposits()
    })

    it("Depositors with varying deposits withdraw correct collateral Gain after three varying liquidations", async () => {
      await openTroveAndProvideStability(contracts, bob, "10,000", "200")
      await openTroveAndProvideStability(contracts, carol, "20,000", "200")
      await openTroveAndProvideStability(contracts, dennis, "30,000", "200")

      await createLiquidationEvent(contracts, deployer, "4,500")
      await createLiquidationEvent(contracts, deployer, "7,000")
      await createLiquidationEvent(contracts, deployer, "12,345")

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithVaryingDeposits()
    })

    it("B, C, D Deposit -> 2 liquidations -> E deposits -> 1 liquidation. All deposits and liquidations = $2000.  B, C, D, E withdraw correct collateral Gain", async () => {
      await openTrovesAndProvideStability(contracts, users, "2000", "200")

      await createLiquidationEvent(contracts, deployer, "2000")
      await createLiquidationEvent(contracts, deployer, "2000")

      await openTroveAndProvideStability(contracts, eric, "2000", "200")

      await createLiquidationEvent(contracts, deployer, "2000")

      const allUsers = [...users, eric]
      await updateTroveSnapshots(contracts, allUsers, "before")
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "before")

      await withdrawCollateralGainToTroves(contracts, allUsers)

      await updateTroveSnapshots(contracts, allUsers, "after")
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "after")

      expectCorrectCollateralGainWithEqualDeposits()
      expectCorrectCollateralGain(eric)
      expect(eric.trove.collateral.after).to.be.lessThan(
        bob.trove.collateral.after,
      )
    })

    it("B, C, D Deposit -> 2 liquidations -> E deposits -> 2 liquidations. All deposits and liquidations = $2000.  B, C, D, E withdraw correct collateral Gain", async () => {
      // The whale provides so that the pool is not fully offset.
      await provideToSP(contracts, whale, "20,000")
      await openTrovesAndProvideStability(contracts, users, "2000", "200")

      await createLiquidationEvent(contracts, deployer, "2000")
      await createLiquidationEvent(contracts, deployer, "2000")

      await openTroveAndProvideStability(contracts, eric, "2000", "200")

      await createLiquidationEvent(contracts, deployer, "2000")
      await createLiquidationEvent(contracts, deployer, "2000")

      const allUsers = [...users, eric]
      await updateTroveSnapshots(contracts, allUsers, "before")
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "before")

      await withdrawCollateralGainToTroves(contracts, allUsers)

      await updateTroveSnapshots(contracts, allUsers, "after")
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "after")

      expectCorrectCollateralGainWithEqualDeposits()
      expectCorrectCollateralGain(eric)
      expect(eric.trove.collateral.after).to.be.lessThan(
        bob.trove.collateral.after,
      )
    })

    it("B, C, D Deposit -> 2 liquidations -> E deposits -> 2 liquidations. Various deposit and liquidation vals.  B, C, D, E withdraw correct collateral Gain", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))
      await Promise.all(
        [
          { user: bob, amount: "5,000" },
          { user: carol, amount: "40,929" },
          { user: dennis, amount: "61,123" },
        ].map(({ user, amount }) =>
          openTroveAndProvideStability(contracts, user, amount, "200"),
        ),
      )

      await createLiquidationEvent(contracts, deployer, "2000")
      await createLiquidationEvent(contracts, deployer, "3456")

      await openTroveAndProvideStability(contracts, eric, "2000", "200")

      await createLiquidationEvent(contracts, deployer, "8899")
      await createLiquidationEvent(contracts, deployer, "11234")

      const allUsers = [...users, eric]
      await updateTroveSnapshots(contracts, allUsers, "before")
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "before")

      await withdrawCollateralGainToTroves(contracts, allUsers)

      await updateTroveSnapshots(contracts, allUsers, "after")
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "after")

      expectCorrectCollateralGainWithVaryingDeposits()
      expectCorrectCollateralGain(eric)
      expect(eric.trove.collateral.after).to.be.lessThan(
        bob.trove.collateral.after,
      )
    })

    it("B, C, D, E deposit -> 2 liquidations -> E withdraws -> 2 liquidations. All deposits and liquidations = $2000.  B, C, D, E withdraw correct collateral Gain", async () => {
      // The whale provides so that the pool is not fully offset.
      await provideToSP(contracts, whale, "20,000")

      const allUsers = [...users, eric]
      await openTrovesAndProvideStability(contracts, allUsers, "2000", "200")

      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshot(contracts, eric, "before")
      await updateStabilityPoolUserSnapshot(contracts, eric, "before")

      await withdrawCollateralGainToTrove(contracts, eric)

      await updateTroveSnapshot(contracts, eric, "after")
      await updateStabilityPoolUserSnapshot(contracts, eric, "after")

      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithEqualDeposits()
      expectCorrectCollateralGain(eric)
      expect(eric.trove.collateral.after).to.be.lessThan(
        bob.trove.collateral.after,
      )
    })

    it("B, C, D, E deposit -> 2 liquidations -> E withdraws -> 2 liquidations. Various deposit and liquidation vals. A, B, C, D withdraw correct collateral Gain", async () => {
      // The whale provides so that the pool is not fully offset.
      await provideToSP(contracts, whale, "20,000")

      await Promise.all(
        [
          { user: bob, amount: "5,000" },
          { user: carol, amount: "40,929" },
          { user: dennis, amount: "61,123" },
          { user: eric, amount: "81,123" },
        ].map(({ user, amount }) =>
          openTroveAndProvideStability(contracts, user, amount, "200"),
        ),
      )

      await createLiquidationEvent(contracts, deployer, "2000")
      await createLiquidationEvent(contracts, deployer, "3456")

      await updateTroveSnapshot(contracts, eric, "before")
      await updateStabilityPoolUserSnapshot(contracts, eric, "before")

      await withdrawCollateralGainToTrove(contracts, eric)

      await updateTroveSnapshot(contracts, eric, "after")
      await updateStabilityPoolUserSnapshot(contracts, eric, "after")

      await createLiquidationEvent(contracts, deployer, "5678")
      await createLiquidationEvent(contracts, deployer, "7890")

      await updateTroveSnapshots(contracts, users, "before")
      await updateStabilityPoolUserSnapshots(contracts, users, "before")

      await withdrawCollateralGainToTroves(contracts, users)

      await updateTroveSnapshots(contracts, users, "after")
      await updateStabilityPoolUserSnapshots(contracts, users, "after")

      expectCorrectCollateralGainWithVaryingDeposits()
      expectCorrectCollateralGain(eric)
    })

    it("Depositor withdraws correct compounded deposit after liquidation empties the pool", async () => {
      await provideToSP(contracts, whale, "5,000")

      // Empty the pool
      await createLiquidationEvent(contracts, deployer, "6,000")

      await updateTroveSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")
      await updatePendingSnapshot(contracts, whale, "before")

      await withdrawCollateralGainToTrove(contracts, whale)

      await updateTroveSnapshot(contracts, whale, "after")
      await updateStabilityPoolUserSnapshot(contracts, whale, "after")
      await updatePendingSnapshot(contracts, whale, "after")

      expect(whale.stabilityPool.deposit.after).to.equal(
        whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.stabilityPool.collateralGain.after).to.equal(0n)
      expect(whale.trove.collateral.after).to.equal(
        whale.trove.collateral.before +
          whale.pending.collateral.before +
          whale.stabilityPool.collateralGain.before,
      )
    })

    it("single deposit fully offset. After subsequent liquidations, depositor withdraws *only* the collateral Gain from one liquidation", async () => {
      await provideToSP(contracts, whale, "5,000")

      // Empty the pool
      await createLiquidationEvent(contracts, deployer, "6,000")

      const collateralGain =
        await contracts.stabilityPool.getDepositorCollateralGain(whale.wallet)

      await createLiquidationEvent(contracts, deployer)
      await createLiquidationEvent(contracts, deployer)

      await updateTroveSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")
      await updatePendingSnapshot(contracts, whale, "before")

      await withdrawCollateralGainToTrove(contracts, whale)

      await updateTroveSnapshot(contracts, whale, "after")
      await updateStabilityPoolUserSnapshot(contracts, whale, "after")
      await updatePendingSnapshot(contracts, whale, "after")

      expect(whale.stabilityPool.collateralGain.before).to.equal(collateralGain)
      expect(whale.stabilityPool.deposit.after).to.equal(
        whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.stabilityPool.collateralGain.after).to.equal(0n)
      expect(whale.trove.collateral.after).to.equal(
        whale.trove.collateral.before +
          whale.pending.collateral.before +
          whale.stabilityPool.collateralGain.before,
      )
    })

    it("deposit spans one scale factor change: Single depositor withdraws correct collateral Gain after one liquidation", async () => {
      // Add just enough mUSD to increase the scale
      await provideToSP(contracts, whale, to1e18("10250") + 500000n)

      await createLiquidationEvent(contracts, deployer, "10,000")

      await updateStabilityPoolUserSnapshot(contracts, whale, "before")
      await updateTroveSnapshot(contracts, whale, "before")
      await updateStabilityPoolSnapshot(contracts, state, "before")

      await withdrawCollateralGainToTrove(contracts, whale)

      await updateStabilityPoolUserSnapshot(contracts, whale, "after")
      await updateTroveSnapshot(contracts, whale, "after")

      expect(state.stabilityPool.currentScale.before).to.equal(1n)
      expect(whale.stabilityPool.deposit.after).to.equal(
        whale.stabilityPool.compoundedDeposit.before,
      )
      expect(whale.stabilityPool.collateralGain.after).to.equal(0n)
      expect(whale.trove.collateral.after).to.equal(
        whale.trove.collateral.before +
          whale.stabilityPool.collateralGain.before,
      )
    })

    it("Several deposits of varying amounts span one scale factor change. Depositors withdraw correct compounded deposit and collateral Gain after one liquidation", async () => {
      // Add just enough mUSD to increase the scale
      await provideToSP(contracts, whale, to1e18("5250") + 500000n)

      await openTroveAndProvideStability(contracts, bob, "3,000", "200")
      await openTroveAndProvideStability(contracts, carol, "2,000", "200")

      await createLiquidationEvent(contracts, deployer, "10,000")

      const allUsers = [bob, carol, whale]
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "before")
      await updateTroveSnapshots(contracts, allUsers, "before")
      await updateStabilityPoolSnapshot(contracts, state, "before")

      await withdrawCollateralGainToTroves(contracts, allUsers)

      await updateStabilityPoolUserSnapshots(contracts, allUsers, "after")
      await updateTroveSnapshots(contracts, allUsers, "after")

      expect(state.stabilityPool.currentScale.before).to.equal(1n)
      users.forEach((user) => {
        expect(user.stabilityPool.deposit.after).to.equal(
          user.stabilityPool.compoundedDeposit.before,
        )
        expect(user.stabilityPool.collateralGain.after).to.equal(0n)
        expect(user.trove.collateral.after).to.equal(
          user.trove.collateral.before +
            user.stabilityPool.collateralGain.before,
        )
      })
    })

    it("2 depositors can withdraw after each receiving half of a pool-emptying liquidation", async () => {
      const allUsers = [bob, carol]

      await openTrovesAndProvideStability(contracts, allUsers, "10,000", "200")

      await createLiquidationEvent(contracts, deployer, "30,000")

      await updatePendingSnapshots(contracts, allUsers, "before")
      await updateStabilityPoolUserSnapshots(contracts, allUsers, "before")
      await updateTroveSnapshots(contracts, allUsers, "before")

      await withdrawCollateralGainToTroves(contracts, allUsers)

      await updateStabilityPoolUserSnapshots(contracts, allUsers, "after")
      await updateTroveSnapshots(contracts, allUsers, "after")

      allUsers.forEach((user) => {
        expect(user.stabilityPool.compoundedDeposit.before).to.equal(0n)
        expect(user.stabilityPool.collateralGain.before).to.be.greaterThan(0n)

        expect(user.stabilityPool.compoundedDeposit.after).to.equal(0n)
        expect(user.stabilityPool.collateralGain.after).to.equal(0n)

        expect(user.trove.collateral.after).to.equal(
          user.trove.collateral.before +
            user.pending.collateral.before +
            user.stabilityPool.collateralGain.before,
        )
        expect(user.trove.debt.after).to.equal(
          user.trove.debt.before + user.pending.principal.before,
        )
      })
    })

    it("Large liquidated coll/debt, deposits and BTC price", async () => {
      // collateral:USD price is $2 billion per BTC
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice(2n * 10n ** 27n)

      const allUsers = [bob, carol]
      const amount = 1n * 10n ** 27n // $ 1 billion
      await openTrovesAndProvideStability(contracts, allUsers, amount, "200")

      await createLiquidationEvent(contracts, deployer, amount)

      await updateStabilityPoolUserSnapshots(contracts, allUsers, "before")
      await updateTroveSnapshots(contracts, allUsers, "before")

      await withdrawCollateralGainToTroves(contracts, allUsers)

      await updateStabilityPoolUserSnapshots(contracts, allUsers, "after")
      await updateTroveSnapshots(contracts, allUsers, "after")

      allUsers.forEach((user) => {
        expect(user.stabilityPool.collateralGain.before).to.be.greaterThan(0n)
        expect(user.stabilityPool.collateralGain.after).to.equal(0n)

        expect(user.trove.collateral.after).to.equal(
          user.trove.collateral.before +
            user.stabilityPool.collateralGain.before,
        )
        expect(user.trove.debt.after).to.equal(user.trove.debt.before)
      })
    })

    it("Small liquidated coll/debt, large deposits and collateral price", async () => {
      // collateral:USD price is $2 billion per BTC
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice(2n * 10n ** 27n)

      const allUsers = [bob, carol]
      const amount = 1n * 10n ** 27n // $ 1 billion
      await openTrovesAndProvideStability(contracts, allUsers, amount, "200")

      await createLiquidationEvent(contracts, deployer, "2,000")

      await updateStabilityPoolUserSnapshots(contracts, allUsers, "before")
      await updateTroveSnapshots(contracts, allUsers, "before")

      await withdrawCollateralGainToTroves(contracts, allUsers)

      await updateStabilityPoolUserSnapshots(contracts, allUsers, "after")
      await updateTroveSnapshots(contracts, allUsers, "after")

      allUsers.forEach((user) => {
        expect(user.stabilityPool.collateralGain.before).to.be.greaterThan(0n)
        expect(user.stabilityPool.collateralGain.after).to.equal(0n)

        expect(user.trove.collateral.after).to.equal(
          user.trove.collateral.before +
            user.stabilityPool.collateralGain.before,
        )
        expect(user.trove.debt.after).to.equal(user.trove.debt.before)
      })
    })

    context("Expected Reverts", () => {
      it("reverts when user has no active deposit", async () => {
        await expect(
          withdrawCollateralGainToTrove(contracts, alice),
        ).to.be.revertedWith("StabilityPool: User must have a non-zero deposit")
      })

      it("reverts if it would leave trove with ICR < MCR", async () => {
        await openTrove(contracts, {
          musdAmount: "5,000",
          ICR: "120",
          sender: bob.wallet,
        })
        await provideToSP(contracts, bob, to1e18(200))

        await createLiquidationEvent(contracts, deployer)

        // drop ICR to 102%
        await dropPrice(contracts, deployer, bob, to1e18(102))

        await expect(
          withdrawCollateralGainToTrove(contracts, bob),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("reverts with subsequent deposit and withdrawal attempt from same account with no intermediate liquidations", async () => {
        await provideToSP(contracts, whale, to1e18("20,000"))

        await createLiquidationEvent(contracts, deployer)

        await withdrawCollateralGainToTrove(contracts, whale)

        await expect(
          withdrawCollateralGainToTrove(contracts, whale),
        ).to.be.revertedWith(
          "StabilityPool: caller must have non-zero collateral Gain",
        )
      })

      it("reverts if user has no trove", async () => {
        const amount = to1e18(900)
        await transferMUSD(contracts, whale, bob, amount)
        await provideToSP(contracts, bob, amount)

        await createLiquidationEvent(contracts, deployer)

        await expect(
          withdrawCollateralGainToTrove(contracts, bob),
        ).to.be.revertedWith(
          "StabilityPool: caller must have an active trove to withdraw collateralGain to",
        )
      })

      it("reverts when depositor has no collateral gain", async () => {
        await provideToSP(contracts, whale, to1e18("20,000"))
        await expect(
          withdrawCollateralGainToTrove(contracts, whale),
        ).to.be.revertedWith(
          "StabilityPool: caller must have non-zero collateral Gain",
        )
      })
    })
  })

  describe("Liquidation State Management", () => {
    it("Pool-emptying liquidation increases epoch by one, resets scaleFactor to 0, and resets P to 1e18", async () => {
      await provideToSP(contracts, whale, to1e18("20,000"))
      await createLiquidationEvent(contracts, deployer, "2,000")

      await updateStabilityPoolSnapshot(contracts, state, "before")

      // The amount the whale originally provided.
      await createLiquidationEvent(contracts, deployer, "20,000")

      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.currentEpoch.after).to.equal(
        state.stabilityPool.currentEpoch.before + 1n,
      )
      expect(state.stabilityPool.currentScale.after).to.equal(0n)
      expect(state.stabilityPool.P.before).to.not.equal(to1e18(1))
      expect(state.stabilityPool.P.after).to.equal(to1e18(1))
    })

    // https://github.com/liquity/dev/security/advisories/GHSA-m9f3-hrx8-x2g3
    it("Handles the liquity v1 advisory", async () => {
      const amount = 9799999999999999980001000n / 1005n
      const nearlyAllThePool = 9999999999999999980000n
      await openTrove(contracts, {
        musdAmount: amount,
        ICR: "111",
        sender: bob.wallet,
      })

      await updateTroveSnapshot(contracts, bob, "before")
      expect(bob.trove.debt.before).to.equal(nearlyAllThePool)

      await provideToSP(contracts, whale, to1e18("10,000"))

      await dropPriceAndLiquidate(contracts, deployer, bob)

      // put us back at $10k
      await provideToSP(contracts, whale, nearlyAllThePool)

      await openTrove(contracts, {
        musdAmount: amount,
        ICR: "111",
        sender: carol.wallet,
      })

      await updateTroveSnapshot(contracts, carol, "before")
      expect(carol.trove.debt.before).to.equal(nearlyAllThePool)

      await dropPriceAndLiquidate(contracts, deployer, carol)

      await updateStabilityPoolSnapshot(contracts, state, "after")
      expect(state.stabilityPool.P.after).to.be.greaterThanOrEqual(1000000000n)
    })
  })
})
