import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"

import {
  Contracts,
  TestSetup,
  TestingAddresses,
  addColl,
  connectContracts,
  fixtureBorrowerOperations,
  getAddresses,
  getTroveEntireColl,
  getTroveEntireDebt,
  openTrove,
  removeMintlist,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("BorrowerOperations in Recovery Mode", () => {
  let addresses: TestingAddresses
  // users
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let dennis: HardhatEthersSigner
  let deployer: HardhatEthersSigner
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  async function defaultTrovesSetup() {
    // data setup
    const transactions = [
      {
        musdAmount: "10,000",
        ICR: "1000",
        sender: alice,
      },
      {
        musdAmount: "20,000",
        ICR: "200",
        sender: bob,
      },
      {
        musdAmount: "30,000",
        ICR: "200",
        sender: carol,
      },
    ]

    for (let i = 0; i < transactions.length; i++) {
      await openTrove(contracts, transactions[i])
    }
  }

  beforeEach(async () => {
    // fixtureBorrowerOperations has a mock trove manager so we can change rates
    cachedTestSetup = await loadFixture(fixtureBorrowerOperations)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts

    await connectContracts(contracts, testSetup.users)
    // users
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    dennis = testSetup.users.dennis
    deployer = testSetup.users.deployer

    // readability helper
    addresses = await getAddresses(contracts, testSetup.users)
  })

  describe("openTrove()", () => {
    /**
     *
     * Expected Reverts
     *
     */

    context("Expected Reverts", () => {
      it("openTrove(): Reverts when system is in Recovery Mode and ICR < CCR", async () => {
        await defaultTrovesSetup()
        // collateral value drops from 200 to 10
        const price = to1e18(10)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        await expect(
          openTrove(contracts, {
            musdAmount: to1e18("2,000"),
            ICR: "149",
            sender: dennis,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
        )
      })

      it("openTrove(): Reverts when trove ICR < MCR", async () => {
        await openTrove(contracts, {
          musdAmount: "1,000,000",
          ICR: "200",
          sender: alice,
        })

        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: bob,
        })

        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            ICR: "109",
            sender: carol,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )

        // collateral value drops from 200 to 10
        const price = to1e18(10)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          true,
        )

        await expect(
          openTrove(contracts, {
            musdAmount: to1e18("2,000"),
            ICR: "109",
            sender: carol,
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
        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "150",
          sender: alice,
        })

        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "150",
          sender: bob,
        })

        // price drops to $100, reducing TCR below 150%
        await contracts.priceFeed.connect(deployer).setPrice(to1e18("100"))

        // Carol opens at 150% ICR in Recovery Mode
        await openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "150",
          sender: carol,
        })

        expect(await contracts.sortedTroves.contains(addresses.carol)).is.equal(
          true,
        )

        const status = await contracts.troveManager.getTroveStatus(
          addresses.carol,
        )
        expect(status).is.equal(1)

        const price = await contracts.priceFeed.getPrice()
        const ICR = await contracts.troveManager.getCurrentICR(carol, price)
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
          musdAmount: "10,000",
          ICR: "200",
          sender: alice,
        })
        // collateral value drops from 200 to 10
        const price = to1e18(10)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          true,
        )
        await openTrove(contracts, {
          musdAmount: "4,000",
          ICR: "200",
          sender: bob,
          maxFeePercentage: "0.4999999999999999",
        })
        const after = await contracts.musd.balanceOf(bob)
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
        await openTrove(contracts, {
          musdAmount: "5,000",
          sender: alice,
        })
        await openTrove(contracts, {
          musdAmount: "5,000",
          sender: carol,
        })
        await openTrove(contracts, {
          musdAmount: "5,000",
          sender: dennis,
        })

        // Collateral value drops from 200 to 100
        const price = to1e18(100)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        // Liquidate Carol's Trove.
        await contracts.troveManager.connect(deployer).liquidate(carol)

        /* with total stakes = 10 ether/tokens, after liquidation, L_Collateral should equal 1/10 ether/token per-ether-staked/per-tokens-staked,
        and L_THUSD should equal 18 THUSD per-ether-staked/per-tokens-staked. */

        const collateral = await contracts.troveManager.L_Collateral()
        const musd = await contracts.troveManager.L_MUSDDebt()

        expect(collateral).is.greaterThan(0n)
        expect(musd).is.greaterThan(0n)

        // Bob opens trove
        await openTrove(contracts, {
          musdAmount: "10,000",
          sender: bob,
        })

        // Check Bob's snapshots of L_Collateral and L_THUSD equal the respective current values
        const bobRewardSnapshot =
          await contracts.troveManager.rewardSnapshots(bob)
        const bobCollateralRewardSnapshot = bobRewardSnapshot[0]
        const bobMUSDDebtRewardSnapshot = bobRewardSnapshot[1]

        expect(bobCollateralRewardSnapshot).is.equal(collateral)
        expect(bobMUSDDebtRewardSnapshot).is.equal(musd)
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
      it("addColl(), reverts if trove is non-existent", async () => {
        // A, B open troves
        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: alice,
        })
        await openTrove(contracts, {
          musdAmount: "10,000",
          sender: bob,
        })

        // collateral value drops from 200 to 10
        const price = to1e18(10)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        await expect(
          addColl(contracts, {
            amount: 1n,
            sender: carol,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("addColl(), reverts if trove is closed", async () => {
        // A, B open troves
        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: alice,
        })
        await openTrove(contracts, {
          musdAmount: "10,000",
          sender: bob,
        })

        // collateral value drops from 200 to 10
        const price = to1e18(10)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        await contracts.troveManager.liquidate(addresses.alice)

        await expect(
          addColl(contracts, {
            amount: 1n,
            sender: carol,
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
        let price = await contracts.priceFeed.getPrice()
        await openTrove(contracts, {
          musdAmount: "2,000",
          ICR: "200",
          sender: alice,
        })

        let result = await contracts.troveManager.getEntireDebtAndColl(
          addresses.alice,
        )
        const aliceStartingCollateral = result[1]

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          false,
        )

        // Collateral value drops from 200 to 100
        price = to1e18(100)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          true,
        )

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice,
        })

        result = await contracts.troveManager.getEntireDebtAndColl(
          addresses.alice,
        )
        const aliceFinalCollateral = result[1]
        expect(aliceFinalCollateral).to.equal(
          aliceStartingCollateral + collateralTopUp,
        )
      })

      it("addColl(), active Trove: applies pending rewards and updates user's L_Collateral, L_THUSDDebt snapshots", async () => {
        // --- SETUP ---
        await defaultTrovesSetup()

        const balances = {
          collateral: {
            alice: {
              after: {},
              before: await getTroveEntireColl(contracts, alice),
            },
            bob: {
              after: {},
              before: await getTroveEntireColl(contracts, bob),
            },
          },
          debt: {
            alice: {
              after: {},
              before: await getTroveEntireDebt(contracts, alice),
            },
            bob: {
              after: {},
              before: await getTroveEntireDebt(contracts, bob),
            },
          },
        }

        // collateral value drops from 200 to 100
        const price = to1e18(10)
        await contracts.priceFeed.connect(deployer).setPrice(price)

        // Liquidate Carol's Trove,
        await contracts.troveManager.liquidate(addresses.carol)

        expect(await contracts.sortedTroves.contains(addresses.carol)).to.equal(
          false,
        )

        const liquidationCollateral =
          await contracts.troveManager.L_Collateral()
        const liquidationDebt = await contracts.troveManager.L_MUSDDebt()

        const snapshots = {
          alice: {
            after: [0n, 0n],
            before: await contracts.troveManager.rewardSnapshots(
              addresses.alice,
            ),
          },
          bob: {
            after: [0n, 0n],
            before: await contracts.troveManager.rewardSnapshots(addresses.bob),
          },
        }

        // check Alice and Bob's reward snapshots are zero before they alter their Troves
        expect(snapshots.alice.before[0]).is.equal(0n) // collateral
        expect(snapshots.alice.before[1]).is.equal(0n) // debt
        expect(snapshots.bob.before[0]).is.equal(0n)
        expect(snapshots.bob.before[1]).is.equal(0n)

        const pending = {
          collateral: {
            alice: await contracts.troveManager.getPendingCollateralReward(
              addresses.alice,
            ),
            bob: await contracts.troveManager.getPendingCollateralReward(
              addresses.bob,
            ),
          },
          debt: {
            alice: await contracts.troveManager.getPendingMUSDDebtReward(
              addresses.alice,
            ),
            bob: await contracts.troveManager.getPendingMUSDDebtReward(
              addresses.bob,
            ),
          },
        }

        // check Alice and Bob have pending reward and debt from the liquidation redistribution
        expect(pending.collateral.alice).to.greaterThan(0n)
        expect(pending.collateral.bob).to.greaterThan(0n)
        expect(pending.debt.alice).to.greaterThan(0n)
        expect(pending.debt.bob).to.greaterThan(0n)

        const aliceTopUp = to1e18(1000)
        await addColl(contracts, {
          amount: aliceTopUp,
          sender: alice,
        })

        const bobTopUp = to1e18(500)
        await addColl(contracts, {
          amount: bobTopUp,
          sender: bob,
        })

        balances.collateral.alice.after = await getTroveEntireColl(
          contracts,
          alice,
        )
        balances.collateral.bob.after = await getTroveEntireColl(contracts, bob)
        balances.debt.alice.after = await getTroveEntireDebt(contracts, alice)
        balances.debt.bob.after = await getTroveEntireDebt(contracts, bob)

        expect(balances.collateral.alice.after).to.equal(
          balances.collateral.alice.before +
            pending.collateral.alice +
            aliceTopUp,
        )
        expect(balances.collateral.bob.after).to.equal(
          balances.collateral.bob.before + pending.collateral.bob + bobTopUp,
        )
        expect(balances.debt.alice.after).to.equal(
          balances.debt.alice.before + pending.debt.alice,
        )
        expect(balances.debt.bob.after).to.equal(
          balances.debt.bob.before + pending.debt.bob,
        )

        /* Check that both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
        to the latest values of L_Collateral and L_THUSDDebt */

        snapshots.alice.after = await contracts.troveManager.rewardSnapshots(
          addresses.alice,
        )
        snapshots.bob.after = await contracts.troveManager.rewardSnapshots(
          addresses.bob,
        )

        expect(snapshots.alice.after[0]).is.equal(liquidationCollateral)
        expect(snapshots.alice.after[1]).is.equal(liquidationDebt)
        expect(snapshots.bob.after[0]).is.equal(liquidationCollateral)
        expect(snapshots.bob.after[1]).is.equal(liquidationDebt)
      })
    })

    /**
     *
     *  Balance changes
     *
     */

    context("Balance changes", () => {
      it("addColl(): no mintlist, can add collateral", async () => {
        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: alice,
        })

        // put system in recovery mode
        await contracts.priceFeed
          .connect(deployer)
          .setPrice(105000000000000000000n)
        const aliceCollBefore = await getTroveEntireColl(contracts, alice)
        const price = await contracts.priceFeed.getPrice()
        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          true,
        )

        await removeMintlist(contracts, deployer)

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice,
        })

        const aliceCollAfter = await getTroveEntireColl(contracts, alice)

        expect(aliceCollAfter).to.equal(aliceCollBefore + collateralTopUp)
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
