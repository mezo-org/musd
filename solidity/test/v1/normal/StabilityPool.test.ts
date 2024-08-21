import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { ContractTransactionResponse } from "ethers"
import {
  NO_GAS,
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
  getEmittedLiquidationValues,
  openTrove,
  provideToSP,
  updateContractsSnapshot,
  updateTroveManagerSnapshot,
  updateTroveSnapshot,
  updateTroveSnapshots,
  updateStabilityPoolSnapshot,
  updateStabilityPoolUserSnapshot,
  updateStabilityPoolUserSnapshots,
  updateWalletSnapshot,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("StabilityPool in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let whale: User
  let state: ContractsState
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  type Pool = "activePool" | "defaultPool"
  const pools: Pool[] = ["activePool", "defaultPool"]

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
    whale = testSetup.users.whale
    addresses = await getAddresses(contracts, testSetup.users)

    // set 1 BTC = $1000 for ease of math
    await contracts.mockAggregator.setPrice(to1e18("1,000"))

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

    await provideToSP(contracts, whale, to1e18("20,000"))
  })

  describe("provideToSP()", () => {
    it("provideToSP(): increases the Stability Pool MUSD balance", async () => {
      const amount = to1e18(30)

      await updateStabilityPoolSnapshot(contracts, state, "before")
      await provideToSP(contracts, alice, amount)
      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before + amount,
      )
    })

    it("provideToSP(): updates the user's deposit record in StabilityPool", async () => {
      const amount = to1e18(200)
      await provideToSP(contracts, alice, amount)

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.deposit.after).to.be.equal(amount)
    })

    it("provideToSP(): reduces the user's MUSD balance", async () => {
      await updateWalletSnapshot(contracts, alice, "before")

      const amount = to1e18(200)

      await provideToSP(contracts, alice, amount)

      await updateWalletSnapshot(contracts, alice, "after")

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
      await provideToSP(contracts, alice, to1e18(100))

      // Check 'After' snapshots
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.before)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.before)
    })

    // This test calls `provideToSP` multiple times and makes assertions after each time.
    // To accomplish this in our state framework, we overwrite `before` and `after` each time.
    it("provideToSP(): multiple deposits: updates user's deposit and snapshots", async () => {
      // Alice makes deposit #1: $1,000
      await provideToSP(contracts, alice, to1e18("1,000"))

      await createLiquidationEvent(contracts)

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

      // Bob withdraws MUSD and deposits to StabilityPool

      await openTrove(contracts, {
        musdAmount: "3,000",
        ICR: "200",
        sender: bob.wallet,
      })

      await updateStabilityPoolSnapshot(contracts, state, "before")

      await provideToSP(contracts, bob, to1e18(427))

      // Trigger another liquidation
      await createLiquidationEvent(contracts)

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

    it("provideToSP(): reverts if user tries to provide more than their MUSD balance", async () => {
      await updateWalletSnapshot(contracts, alice, "before")

      await expect(provideToSP(contracts, alice, alice.musd.before + 1n)).to.be
        .reverted
    })

    it("provideToSP(): reverts if user tries to provide 2^256-1 MUSD, which exceeds their balance", async () => {
      // Alice attempts to deposit 2^256-1 MUSD
      const maxBytes32 = BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )

      await expect(provideToSP(contracts, alice, maxBytes32)).to.be.reverted
    })

    context("No unexpected state changes", async () => {
      beforeEach(async () => {
        // Bob and Carol open troves and make Stability Pool deposits
        await Promise.all(
          [bob, carol].map(async (user) => {
            const amount = to1e18("5,000")
            await openTrove(contracts, {
              musdAmount: amount,
              ICR: "200",
              sender: user.wallet,
            })

            await provideToSP(contracts, user, amount)
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
        await provideToSP(contracts, dennis, to1e18("1,000"))

        expect(
          (
            await contracts.stabilityPool.getCompoundedMUSDDeposit(
              dennis.wallet,
            )
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

      it("provideToSP(): doesn't impact system debt, collateral or TCR", async () => {
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

      it("provideToSP(): doesn't impact any troves, including the caller's trove", async () => {
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
    })

    it("provideToSP(): doesn't protect the depositor's trove from liquidation", async () => {
      await openTrove(contracts, {
        musdAmount: "2,000",
        ICR: "120",
        sender: bob.wallet,
      })

      await provideToSP(contracts, bob, to1e18("2,000"))

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
      await expect(provideToSP(contracts, bob, 0n)).to.be.reverted
    })

    it("provideToSP(): new deposit; depositor does not receive collateral gains", async () => {
      await createLiquidationEvent(contracts)

      // Alice deposits to the Pool

      await provideToSP(contracts, alice, to1e18("2,000"))

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
    })

    it("provideToSP(): new deposit after past full withdrawal; depositor does not receive collateral gains", async () => {
      // Alice enters and then exits the pool
      const amount = to1e18("2,000")

      await provideToSP(contracts, alice, amount)

      await contracts.stabilityPool.connect(alice.wallet).withdrawFromSP(amount)

      await createLiquidationEvent(contracts)

      // Alice deposits to the Pool
      await provideToSP(contracts, alice, amount)

      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
    })
  })

  describe("withdrawFromSP()", () => {
    it("withdrawFromSP(): reverts when user has no active deposit", async () => {
      await expect(
        contracts.stabilityPool.connect(alice.wallet).withdrawFromSP(1n),
      ).to.be.revertedWith("StabilityPool: User must have a non-zero deposit")
    })

    it("withdrawFromSP(): reverts when amount > 0 and system has an undercollateralized trove", async () => {
      // Open a barely-collateralized trove for Bob.
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "120",
        sender: bob.wallet,
      })

      // Decrease collateral price from $1000 to $900, making Bob's CR equal 108%
      await contracts.mockAggregator.setPrice(900)

      await expect(
        contracts.stabilityPool.connect(whale.wallet).withdrawFromSP(1n),
      ).to.be.revertedWith(
        "StabilityPool: Cannot withdraw while there are troves with ICR < MCR",
      )
    })

    context("partial retrieval", () => {
      let liquidationTx: ContractTransactionResponse
      beforeEach(async () => {
        await provideToSP(contracts, alice, to1e18("5,000"))

        await updateStabilityPoolUserSnapshots(
          contracts,
          [alice, whale],
          "before",
        )
        await updateStabilityPoolSnapshot(contracts, state, "before")

        liquidationTx = await createLiquidationEvent(contracts)

        await updateWalletSnapshot(contracts, alice, "before")

        // Retrive $900
        await contracts.stabilityPool
          .connect(alice.wallet)
          .withdrawFromSP(to1e18(900), NO_GAS)

        await updateStabilityPoolSnapshot(contracts, state, "after")
        await updateStabilityPoolUserSnapshot(contracts, alice, "after")
        await updateWalletSnapshot(contracts, alice, "after")
      })

      it("withdrawFromSP(): retrieves correct MUSD amount and the entire collateral Gain, and updates deposit", async () => {
        const { liquidatedDebt, liquidatedColl } =
          await getEmittedLiquidationValues(liquidationTx)

        const expectedMUSDLoss =
          (liquidatedDebt * alice.stabilityPool.deposit.before) /
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

      it("withdrawFromSP(): leaves the correct amount of MUSD in the Stability Pool", async () => {
        const { liquidatedDebt } =
          await getEmittedLiquidationValues(liquidationTx)

        const expectedMUSD =
          state.stabilityPool.musd.before -
          to1e18(900) - // alice withdrew $900
          liquidatedDebt

        expect(state.stabilityPool.musd.after).to.equal(expectedMUSD)
      })
    })

    it("withdrawFromSP(): full retrieval - leaves the correct amount of MUSD in the Stability Pool", async () => {
      await provideToSP(contracts, alice, to1e18("5,000"))

      await updateStabilityPoolUserSnapshots(
        contracts,
        [alice, whale],
        "before",
      )
      await updateStabilityPoolSnapshot(contracts, state, "before")

      const liquidationTx = await createLiquidationEvent(contracts)

      const { liquidatedDebt } =
        await getEmittedLiquidationValues(liquidationTx)

      const expectedMUSDLoss =
        (liquidatedDebt * alice.stabilityPool.deposit.before) /
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
          liquidatedDebt -
          aliceRemainingDeposit,
        5000n,
      )
    })

    it("withdrawFromSP(): Subsequent deposit and withdrawal attempt from same account, with no intermediate liquidations, withdraws zero collateral", async () => {
      await provideToSP(contracts, alice, to1e18("5,000"))

      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): it correctly updates the user's MUSD and collateral snapshots of entitled reward per unit staked", async () => {
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts)
      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(900))

      await updateStabilityPoolSnapshot(contracts, state, "after")
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")

      expect(alice.stabilityPool.P.after).to.equal(state.stabilityPool.P.after)
      expect(alice.stabilityPool.S.after).to.equal(state.stabilityPool.S.after)
    })

    it("withdrawFromSP(): decreases StabilityPool collateral", async () => {
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): All depositors are able to withdraw from the SP to their account", async () => {
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): increases depositor's MUSD token balance by the expected amount", async () => {
      await provideToSP(contracts, alice, to1e18("4,000"))

      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): doesn't impact other users deposits or collateral gains", async () => {
      await provideToSP(contracts, alice, to1e18("3,000"))
      await Promise.all(
        [bob, carol].map(async (user) => {
          await openTrove(contracts, {
            musdAmount: "5000",
            ICR: "200",
            sender: user.wallet,
          })
          await provideToSP(contracts, user, to1e18("3,000"))
        }),
      )

      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): doesn't impact system debt, collateral or TCR ", async () => {
      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): doesn't impact any troves, including the caller's trove", async () => {
      await Promise.all(
        [bob, carol].map(async (user) => {
          await openTrove(contracts, {
            musdAmount: "5000",
            ICR: "200",
            sender: user.wallet,
          })
        }),
      )

      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): succeeds when amount is 0 and system has an undercollateralized trove", async () => {
      await createLiquidationEvent(contracts)

      await openTrove(contracts, {
        musdAmount: "2,000", // slightly over the minimum of $1800
        ICR: "120", // 120%
        sender: bob.wallet,
      })

      const priceBefore = await contracts.priceFeed.fetchPrice()

      // Drop price to 90% of prior. This makes the Bob's ICR equal to 108%
      // which is below the MCR of 110%
      await contracts.mockAggregator.setPrice((priceBefore * 9n) / 10n)

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

    it("withdrawFromSP(): withdrawing 0 MUSD doesn't alter the caller's deposit or the total MUSD in the Stability Pool", async () => {
      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): withdrawing 0 collateral Gain does not alter the caller's collateral balance, their trove collateral, or the collateral in the Stability Pool", async () => {
      await createLiquidationEvent(contracts)

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

    it("withdrawFromSP(): Requests to withdraw amounts greater than the caller's compounded deposit only withdraws the caller's compounded deposit", async () => {
      await updateStabilityPoolSnapshot(contracts, state, "before")
      await updateWalletSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(
          whale.stabilityPool.compoundedDeposit.before + to1e18("20,000"),
        )

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

    it("withdrawFromSP(): Request to withdraw 2^256-1 MUSD only withdraws the caller's compounded deposit", async () => {
      const maxBytes32 = BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )

      await updateStabilityPoolSnapshot(contracts, state, "before")
      await updateWalletSnapshot(contracts, whale, "before")
      await updateStabilityPoolUserSnapshot(contracts, whale, "before")

      await contracts.stabilityPool
        .connect(whale.wallet)
        .withdrawFromSP(maxBytes32)

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
  })
})
