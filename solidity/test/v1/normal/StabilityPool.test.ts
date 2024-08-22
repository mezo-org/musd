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
  dropPrice,
  withdrawCollateralGainToTrove,
  transferMUSD,
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
    const setupTroveAndLiquidation = async () => {
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
    }

    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("provideToSP(): reverts if user tries to provide more than their MUSD balance", async () => {
        await updateWalletSnapshot(contracts, alice, "before")

        await expect(provideToSP(contracts, alice, alice.musd.before + 1n)).to
          .be.reverted
      })

      it("provideToSP(): reverts if user tries to provide 2^256-1 MUSD, which exceeds their balance", async () => {
        // Alice attempts to deposit 2^256-1 MUSD
        const maxBytes32 = BigInt(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        )

        await expect(provideToSP(contracts, alice, maxBytes32)).to.be.reverted
      })

      it("provideToSP(): providing $0 reverts", async () => {
        await expect(provideToSP(contracts, bob, 0n)).to.be.reverted
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

        expect(alice.stabilityPool.P.after).to.equal(
          state.stabilityPool.P.before,
        )
        expect(alice.stabilityPool.S.after).to.equal(
          state.stabilityPool.S.before,
        )
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

        expect(alice.stabilityPool.P.after).to.equal(
          state.stabilityPool.P.after,
        )
        expect(alice.stabilityPool.S.after).to.equal(
          state.stabilityPool.S.after,
        )

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

        expect(alice.stabilityPool.P.after).to.equal(
          state.stabilityPool.P.before,
        )
        expect(alice.stabilityPool.S.after).to.equal(
          state.stabilityPool.S.before,
        )
      })

      it("provideToSP(): doesn't impact other users' deposits or collateral gains", async () => {
        await setupTroveAndLiquidation()
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

        await contracts.stabilityPool
          .connect(alice.wallet)
          .withdrawFromSP(amount)

        await createLiquidationEvent(contracts)

        // Alice deposits to the Pool
        await provideToSP(contracts, alice, amount)

        await updateStabilityPoolUserSnapshot(contracts, alice, "after")

        expect(alice.stabilityPool.collateralGain.after).to.equal(0n)
      })
    })

    /**
     *
     * Individual Troves
     *
     */
    context("Individual Troves", () => {
      it("provideToSP(): doesn't impact any troves, including the caller's trove", async () => {
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

      it("provideToSP(): doesn't protect the depositor's trove from liquidation", async () => {
        await openTrove(contracts, {
          musdAmount: "2,000",
          ICR: "120",
          sender: bob.wallet,
        })

        await provideToSP(contracts, bob, to1e18("2,000"))

        await dropPrice(contracts, bob)

        // Liquidate bob
        await contracts.troveManager.liquidate(bob.wallet)

        // Check Bob's trove has been removed from the system
        expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(
          false,
        )

        // check Bob's trove status was closed by liquidation
        expect(
          (await contracts.troveManager.getTroveStatus(bob.wallet)).toString(),
        ).to.equal("3")
      })
    })

    /**
     *
     * Balance changes
     *
     */
    context("Balance changes", () => {
      it("provideToSP(): reduces the user's MUSD balance", async () => {
        await updateWalletSnapshot(contracts, alice, "before")

        const amount = to1e18(200)

        await provideToSP(contracts, alice, amount)

        await updateWalletSnapshot(contracts, alice, "after")

        expect(alice.musd.after).to.equal(alice.musd.before - amount)
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
      it("provideToSP(): doesn't impact system debt, collateral or TCR", async () => {
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

      liquidationTx = await createLiquidationEvent(contracts)

      await updateWalletSnapshot(contracts, alice, "before")

      // Retrive $900
      await contracts.stabilityPool
        .connect(alice.wallet)
        .withdrawFromSP(to1e18(900), NO_GAS)

      await updateStabilityPoolSnapshot(contracts, state, "after")
      await updateStabilityPoolUserSnapshot(contracts, alice, "after")
      await updateWalletSnapshot(contracts, alice, "after")
    }

    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
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

        await dropPrice(contracts, bob)

        await expect(
          contracts.stabilityPool.connect(whale.wallet).withdrawFromSP(1n),
        ).to.be.revertedWith(
          "StabilityPool: Cannot withdraw while there are troves with ICR < MCR",
        )
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
      it("withdrawFromSP(): leaves the correct amount of MUSD in the Stability Pool", async () => {
        await setupPartialRetrieval()
        const { liquidatedDebt } =
          await getEmittedLiquidationValues(liquidationTx)

        const expectedMUSD =
          state.stabilityPool.musd.before -
          to1e18(900) - // alice withdrew $900
          liquidatedDebt

        expect(state.stabilityPool.musd.after).to.equal(expectedMUSD)
      })

      it("withdrawFromSP(): full retrieval - leaves the correct amount of MUSD in the Stability Pool", async () => {
        await provideToSP(contracts, alice, to1e18("5,000"))

        await updateStabilityPoolUserSnapshots(
          contracts,
          [alice, whale],
          "before",
        )
        await updateStabilityPoolSnapshot(contracts, state, "before")

        const tx = await createLiquidationEvent(contracts)

        const { liquidatedDebt } = await getEmittedLiquidationValues(tx)

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

      it("withdrawFromSP(): it correctly updates the user's MUSD and collateral snapshots of entitled reward per unit staked", async () => {
        await provideToSP(contracts, alice, to1e18("4,000"))

        await createLiquidationEvent(contracts)
        await contracts.stabilityPool
          .connect(alice.wallet)
          .withdrawFromSP(to1e18(900))

        await updateStabilityPoolSnapshot(contracts, state, "after")
        await updateStabilityPoolUserSnapshot(contracts, alice, "after")

        expect(alice.stabilityPool.P.after).to.equal(
          state.stabilityPool.P.after,
        )
        expect(alice.stabilityPool.S.after).to.equal(
          state.stabilityPool.S.after,
        )
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

        await updateStabilityPoolUserSnapshots(
          contracts,
          [bob, carol],
          "before",
        )

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

      it("withdrawFromSP(): succeeds when amount is 0 and system has an undercollateralized trove", async () => {
        await createLiquidationEvent(contracts)

        await openTrove(contracts, {
          musdAmount: "2,000", // slightly over the minimum of $1800
          ICR: "120", // 120%
          sender: bob.wallet,
        })

        await dropPrice(contracts, bob)

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
    })

    /**
     *
     * Individual Troves
     *
     */
    context("Individual Troves", () => {
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
    })

    /**
     *
     * Balance changes
     *
     */
    context("Balance changes", () => {
      it("withdrawFromSP(): retrieves correct MUSD amount and the entire collateral Gain, and updates deposit", async () => {
        await setupPartialRetrieval()
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
      it("withdrawFromSP(): doesn't impact system debt, collateral or TCR ", async () => {
        await createLiquidationEvent(contracts)

        await updateTroveManagerSnapshot(contracts, state, "before")
        await Promise.all(
          pools.map((pool) =>
            updateContractsSnapshot(
              contracts,
              state,
              pool,
              "before",
              addresses,
            ),
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
        expect(state.activePool.debt.after).to.equal(
          state.activePool.debt.before,
        )
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
    })
  })

  describe("withdrawCollateralGainToTrove()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("withdrawCollateralGainToTrove(): reverts when user has no active deposit", async () => {
        await expect(
          withdrawCollateralGainToTrove(contracts, alice),
        ).to.be.revertedWith("StabilityPool: User must have a non-zero deposit")
      })

      it("withdrawCollateralGainToTrove(): reverts if it would leave trove with ICR < MCR", async () => {
        await openTrove(contracts, {
          musdAmount: "5,000", // slightly over the minimum of $1800
          ICR: "120", // 120%
          sender: bob.wallet,
        })
        await provideToSP(contracts, bob, to1e18(200))

        await createLiquidationEvent(contracts)

        // drop ICR to 102%
        await dropPrice(contracts, bob, to1e18(102) / 100n)

        await expect(
          withdrawCollateralGainToTrove(contracts, bob),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("withdrawCollateralGainToTrove(): reverts with subsequent deposit and withdrawal attempt from same account with no intermediate liquidations", async () => {
        await createLiquidationEvent(contracts)

        await withdrawCollateralGainToTrove(contracts, whale)

        await expect(
          withdrawCollateralGainToTrove(contracts, whale),
        ).to.be.revertedWith(
          "StabilityPool: caller must have non-zero collateral Gain",
        )
      })

      it("withdrawCollateralGainToTrove(): reverts if user has no trove", async () => {
        const amount = to1e18(900)
        await transferMUSD(contracts, whale, bob, amount)
        await provideToSP(contracts, bob, amount)

        await createLiquidationEvent(contracts)

        await expect(
          withdrawCollateralGainToTrove(contracts, bob),
        ).to.be.revertedWith(
          "StabilityPool: caller must have an active trove to withdraw collateralGain to",
        )
      })

      it("withdrawCollateralGainToTrove(): reverts when depositor has no collateral gain", async () => {
        await expect(
          withdrawCollateralGainToTrove(contracts, whale),
        ).to.be.revertedWith(
          "StabilityPool: caller must have non-zero collateral Gain",
        )
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
      it("withdrawCollateralGainToTrove(): decreases StabilityPool collateral and increases activePool collateral", async () => {
        await createLiquidationEvent(contracts)

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
    })

    /**
     *
     * Individual Troves
     *
     */
    context("Individual Troves", () => {})

    /**
     *
     * Balance changes
     *
     */
    context("Balance changes", () => {
      it("withdrawCollateralGainToTrove(): Applies MUSDLoss to user's deposit, and redirects collateral reward to user's Trove", async () => {
        await createLiquidationEvent(contracts)

        await updateTroveSnapshot(contracts, whale, "before")
        await updateStabilityPoolUserSnapshot(contracts, whale, "before")

        await withdrawCollateralGainToTrove(contracts, whale)

        await updateTroveSnapshot(contracts, whale, "after")
        await updateStabilityPoolUserSnapshot(contracts, whale, "after")

        expect(whale.stabilityPool.deposit.after).to.equal(
          whale.stabilityPool.compoundedDeposit.before,
        )
        expect(whale.stabilityPool.collateralGain.after).to.equal(0n)
        expect(whale.trove.collateral.after).to.equal(
          whale.trove.collateral.before +
            whale.stabilityPool.collateralGain.before,
        )
      })

      it("withdrawCollateralGainToTrove(): All depositors are able to withdraw their collateral gain from the SP to their Trove", async () => {
        const users = [bob, carol, dennis]
        await Promise.all(
          users.map(async (user) => {
            await openTrove(contracts, {
              musdAmount: "5,000",
              ICR: "200",
              sender: user.wallet,
            })
            await provideToSP(contracts, user, to1e18("5,000"))
          }),
        )

        await createLiquidationEvent(contracts)

        await updateTroveSnapshots(contracts, users, "before")
        await updateStabilityPoolUserSnapshots(contracts, users, "before")

        await Promise.all(
          users.map((user) => withdrawCollateralGainToTrove(contracts, user)),
        )

        await updateTroveSnapshots(contracts, users, "after")
        await updateStabilityPoolUserSnapshots(contracts, users, "after")

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
})
