import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"

import {
  Contracts,
  TestSetup,
  User,
  addColl,
  connectContracts,
  fixture,
  getTroveEntireColl,
  getTroveEntireDebt,
  openTrove,
  removeMintlist,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("BorrowerOperations in Recovery Mode", () => {
  let alice: User
  let bob: User
  let carol: User
  let deployer: User
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  async function recoveryModeSetup() {
    // data setup
    const transactions = [
      {
        musdAmount: "10,000",
        sender: alice.wallet,
      },
      {
        musdAmount: "20,000",
        sender: bob.wallet,
      },
    ]

    for (let i = 0; i < transactions.length; i++) {
      await openTrove(contracts, transactions[i])
    }

    // collateral value drops from 50,000 to 10,000
    const price = to1e18("10,000")
    await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)
    expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(true)
  }

  beforeEach(async () => {
    // fixtureBorrowerOperations has a mock trove manager so we can change rates
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts

    await connectContracts(contracts, testSetup.users)
    // users
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    deployer = testSetup.users.deployer

    await recoveryModeSetup()
  })

  describe("openTrove()", () => {
    /**
     *
     * Expected Reverts
     *
     */

    context("Expected Reverts", () => {
      it("openTrove(): Reverts when system is in Recovery Mode and ICR < CCR", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: to1e18("2,000"),
            ICR: "149",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
        )
      })

      it("openTrove(): Reverts when trove ICR < MCR", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: to1e18("2,000"),
            ICR: "109",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
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

    context("System State Changes", () => {})

    /**
     *
     * Individual Troves
     *
     */

    context("Individual Troves", () => {
      it("openTrove(): Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
        // Carol opens at 150% ICR in Recovery Mode
        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "150",
          sender: carol.wallet,
        })

        expect(await contracts.sortedTroves.contains(carol.address)).is.equal(
          true,
        )

        const status = await contracts.troveManager.getTroveStatus(
          carol.address,
        )
        expect(status).is.equal(1)

        const price = await contracts.priceFeed.fetchPrice()
        const ICR = await contracts.troveManager.getCurrentICR(
          carol.wallet,
          price,
        )
        expect(ICR).is.equal(to1e18(150) / 100n)
      })
    })

    /**
     *
     *  Balance changes
     *
     */

    context("Balance changes", () => {})

    /**
     *
     * Fees
     *
     */

    context("Fees", () => {
      it("openTrove(): Allows max fee < 0.5% in Recovery Mode", async () => {
        await openTrove(contracts, {
          musdAmount: "4,000",
          ICR: "200",
          sender: carol.wallet,
          maxFeePercentage: "0.4999999999999999",
        })
        const after = await contracts.musd.balanceOf(carol.wallet)
        expect(after).to.equal(to1e18("4,000"))
      })
    })

    /**
     *
     * State change in other contracts
     *
     */

    context("State change in other contracts", () => {
      it("openTrove(): Records up-to-date initial snapshots of L_Collateral and L_MUSDDebt", async () => {
        // Liquidate Alice's Trove.
        await contracts.troveManager
          .connect(deployer.wallet)
          .liquidate(alice.wallet)

        /* with total stakes = 10 ether/tokens, after liquidation, L_Collateral should equal 1/10 ether/token per-ether-staked/per-tokens-staked,
        and L_THUSD should equal 18 MUSD per-ether-staked/per-tokens-staked. */

        const liquidatedCollateral = await contracts.troveManager.L_Collateral()
        const liquidatedDebt = await contracts.troveManager.L_MUSDDebt()

        expect(liquidatedCollateral).is.greaterThan(0n)
        expect(liquidatedDebt).is.greaterThan(0n)

        // Carol opens trove
        await openTrove(contracts, {
          musdAmount: "10,000",
          sender: carol.wallet,
        })

        // Check Carol's snapshots of L_Collateral and L_MUSD equal the respective current values
        const snapshot = await contracts.troveManager.rewardSnapshots(
          carol.wallet,
        )
        expect(snapshot[0]).is.equal(liquidatedCollateral)
        expect(snapshot[1]).is.equal(liquidatedDebt)
      })
    })
  })

  describe("addColl()", () => {
    /**
     *
     * Expected Reverts
     *
     */

    context("Expected Reverts", () => {
      it("addColl(): reverts when top-up would leave trove with ICR < MCR", async () => {
        const price = to1e18("25,000")
        await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)

        await openTrove(contracts, {
          musdAmount: "20,000",
          ICR: "500",
          sender: carol.wallet,
        })

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          false,
        )
        expect(
          await contracts.troveManager.getCurrentICR(alice.address, price),
        ).to.lessThan(to1e18(110))
        const collateralTopUp = to1e18(0.001)

        await expect(
          addColl(contracts, {
            amount: collateralTopUp,
            sender: alice.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("addColl(), reverts if trove is non-existent", async () => {
        await expect(
          addColl(contracts, {
            amount: 1n,
            sender: carol.wallet,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("addColl(), reverts if trove is closed", async () => {
        await contracts.troveManager.liquidate(alice.address)
        await expect(
          addColl(contracts, {
            amount: 1n,
            sender: alice.wallet,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
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

    context("System State Changes", () => {})

    /**
     *
     * Individual Troves
     *
     */

    context("Individual Troves", () => {
      it("addColl(): can add collateral in Recovery Mode", async () => {
        alice.collateral.before = await getTroveEntireColl(
          contracts,
          alice.wallet,
        )

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        alice.collateral.after = await getTroveEntireColl(
          contracts,
          alice.wallet,
        )
        expect(alice.collateral.after).to.equal(
          alice.collateral.before + collateralTopUp,
        )
      })

      it("addColl(), active Trove: applies pending rewards and updates user's L_Collateral, L_THUSDDebt snapshots", async () => {
        await openTrove(contracts, {
          musdAmount: "30,000",
          sender: carol.wallet,
        })

        bob.collateral.before = await getTroveEntireColl(contracts, bob.wallet)
        bob.debt.before = await getTroveEntireDebt(contracts, bob.wallet)
        carol.collateral.before = await getTroveEntireColl(
          contracts,
          carol.wallet,
        )
        carol.debt.before = await getTroveEntireDebt(contracts, carol.wallet)

        // Liquidate Alice's Trove,
        await contracts.troveManager.liquidate(alice.address)
        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          false,
        )

        const liquidationCollateral =
          await contracts.troveManager.L_Collateral()
        const liquidationDebt = await contracts.troveManager.L_MUSDDebt()

        const snapshots = {
          bob: {
            after: [0n, 0n],
            before: await contracts.troveManager.rewardSnapshots(bob.address),
          },
          carol: {
            after: [0n, 0n],
            before: await contracts.troveManager.rewardSnapshots(carol.address),
          },
        }

        // check Alice and Bob's reward snapshots are zero before they alter their Troves
        expect(snapshots.bob.before[0]).is.equal(0n)
        expect(snapshots.bob.before[1]).is.equal(0n)
        expect(snapshots.carol.before[0]).is.equal(0n) // collateral
        expect(snapshots.carol.before[1]).is.equal(0n) // debt

        const pending = {
          collateral: {
            bob: await contracts.troveManager.getPendingCollateralReward(
              bob.address,
            ),
            carol: await contracts.troveManager.getPendingCollateralReward(
              carol.address,
            ),
          },
          debt: {
            bob: await contracts.troveManager.getPendingMUSDDebtReward(
              bob.address,
            ),
            carol: await contracts.troveManager.getPendingMUSDDebtReward(
              carol.address,
            ),
          },
        }

        // check Alice and Bob have pending reward and debt from the liquidation redistribution
        expect(pending.collateral.carol).to.greaterThan(0n)
        expect(pending.collateral.bob).to.greaterThan(0n)
        expect(pending.debt.carol).to.greaterThan(0n)
        expect(pending.debt.bob).to.greaterThan(0n)

        const bobTopUp = to1e18(5)
        await addColl(contracts, {
          amount: bobTopUp,
          sender: bob.wallet,
        })

        const carolTopUp = to1e18(1)
        await addColl(contracts, {
          amount: carolTopUp,
          sender: carol.wallet,
        })

        bob.collateral.after = await getTroveEntireColl(contracts, bob.wallet)
        bob.debt.after = await getTroveEntireDebt(contracts, bob.wallet)
        carol.collateral.after = await getTroveEntireColl(
          contracts,
          carol.wallet,
        )
        carol.debt.after = await getTroveEntireDebt(contracts, carol.wallet)

        expect(bob.collateral.after).to.equal(
          bob.collateral.before + bobTopUp + pending.collateral.bob,
        )
        expect(bob.debt.after).to.equal(bob.debt.before + pending.debt.bob)
        expect(carol.collateral.after).to.equal(
          carol.collateral.before + carolTopUp + pending.collateral.carol,
        )
        expect(carol.debt.after).to.equal(
          carol.debt.before + pending.debt.carol,
        )

        /* Check that both Bob and Carol's snapshots of the rewards-per-unit-staked metrics should be updated
        to the latest values of L_Collateral and L_THUSDDebt */

        snapshots.bob.after = await contracts.troveManager.rewardSnapshots(
          bob.address,
        )
        snapshots.carol.after = await contracts.troveManager.rewardSnapshots(
          carol.address,
        )

        expect(snapshots.bob.after[0]).is.equal(liquidationCollateral)
        expect(snapshots.bob.after[1]).is.equal(liquidationDebt)
        expect(snapshots.carol.after[0]).is.equal(liquidationCollateral)
        expect(snapshots.carol.after[1]).is.equal(liquidationDebt)
      })
    })

    /**
     *
     *  Balance changes
     *
     */

    context("Balance changes", () => {
      it("addColl(): no mintlist, can add collateral", async () => {
        alice.collateral.before = await getTroveEntireColl(
          contracts,
          alice.wallet,
        )

        await removeMintlist(contracts, deployer.wallet)

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        alice.collateral.after = await getTroveEntireColl(
          contracts,
          alice.wallet,
        )
        expect(alice.collateral.after).to.equal(
          alice.collateral.before + collateralTopUp,
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

    context("State change in other contracts", () => {})
  })
})
