import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect, assert } from "chai"

import { ethers } from "hardhat"
import {
  Contracts,
  TestSetup,
  TestingAddresses,
  connectContracts,
  fixtureBorrowerOperations,
  fastForwardTime,
  getEventArgByName,
  getLatestBlockTimestamp,
  getTCR,
  getTroveEntireColl,
  getTroveEntireDebt,
  getAddresses,
  openTrove,
  removeMintlist,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("BorrowerOperations in Normal Mode", () => {
  let addresses: TestingAddresses
  // users
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let dennis: HardhatEthersSigner
  let eric: HardhatEthersSigner
  let deployer: HardhatEthersSigner
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup
  let MIN_NET_DEBT: bigint
  let MUSD_GAS_COMPENSATION: bigint

  async function lowCRSetup() {
    await openTrove(contracts, {
      musdAmount: "10,000",
      sender: alice,
    })

    await openTrove(contracts, {
      musdAmount: "20,000",
      sender: bob,
    })

    await openTrove(contracts, {
      musdAmount: "30,000",
      sender: carol,
    })
  }

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

  async function setNewRate(rate: bigint) {
    if ("setBaseRate" in contracts.troveManager) {
      // Artificially make baseRate 5%
      await contracts.troveManager.setBaseRate(rate)
      await contracts.troveManager.setLastFeeOpTimeToNow()
    } else {
      assert.fail("TroveManagerTester not loaded")
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
    eric = testSetup.users.eric
    deployer = testSetup.users.deployer

    MIN_NET_DEBT = await contracts.borrowerOperations.MIN_NET_DEBT()
    MUSD_GAS_COMPENSATION =
      await contracts.borrowerOperations.MUSD_GAS_COMPENSATION()

    // readability helper
    addresses = await getAddresses(contracts, testSetup.users)
  })

  describe("Initial State", () => {
    it("name(): Returns the contract's name", async () => {
      expect(await contracts.borrowerOperations.name()).to.equal(
        "BorrowerOperations",
      )
    })
  })

  describe("openTrove", () => {
    /**
     *
     * Expected Reverts
     *
     */

    context("Expected Reverts", () => {
      it("openTrove(): Reverts when BorrowerOperations address is not in mintlist", async () => {
        // remove mintlist
        await removeMintlist(contracts, deployer)
        await expect(
          openTrove(contracts, {
            musdAmount: "100,000",
            sender: deployer,
          }),
        ).to.be.revertedWith("MUSD: Caller not allowed to mint")
      })

      it("openTrove(): Reverts if amount to borrow is zero", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "0",
            sender: alice,
          }),
        ).to.be.revertedWithPanic()
      })

      it("openTrove(): Reverts if net debt < minimum net debt", async () => {
        const amount =
          (await contracts.borrowerOperations.MIN_NET_DEBT()) -
          (await contracts.borrowerOperations.MUSD_GAS_COMPENSATION()) -
          1n
        await expect(
          openTrove(contracts, {
            musdAmount: amount,
            sender: bob,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: Trove's net debt must be greater than minimum",
        )
      })

      it("openTrove(): Reverts if max fee > 100%", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: alice,
            maxFeePercentage: "101",
          }),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("openTrove(): Reverts if max fee < 0.5% in Normal mode", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: alice,
            maxFeePercentage: "0",
          }),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")

        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: bob,
            maxFeePercentage: "0.4999999999999999",
          }),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("openTrove(): Reverts if fee exceeds max fee percentage", async () => {
        // setup
        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        // actual fee percentage: 0.05000000186264514
        // user's max fee percentage:  0.005

        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: dennis,
            maxFeePercentage: "0.5",
          }),
        ).to.be.revertedWith("Fee exceeded provided maximum")
      })

      it("openTrove(): Reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
        // Alice creates trove with 150% ICR.  System TCR = 150%.
        await openTrove(contracts, {
          musdAmount: "5,000",
          sender: alice,
        })

        const TCR = await getTCR(contracts)
        assert.equal(TCR, to1e18(150) / 100n)

        // Bob attempts to open a trove with ICR = 149%
        // System TCR would fall below 150%
        await expect(
          openTrove(contracts, {
            musdAmount: "5,000",
            ICR: "149",
            sender: bob,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in TCR < CCR is not permitted",
        )
      })

      it("openTrove(): Reverts if trove is already active", async () => {
        await defaultTrovesSetup()
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: alice,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove is active")
      })
    })

    /**
     *
     * Events
     *
     */

    context("Emitted Events", () => {
      it("openTrove(): Emits a TroveUpdated event with the correct collateral and debt", async () => {
        const abi = [
          // Add your contract ABI here
          "event TroveUpdated(address indexed borrower, uint256 debt, uint256 coll, uint256 stake, uint8 operation)",
        ]

        // data setup
        let transactions = [
          {
            musdAmount: "15,000",
            sender: alice,
          },
          {
            musdAmount: "5,000",
            sender: bob,
          },
          {
            musdAmount: "3,000",
            sender: carol,
          },
        ]

        let tx
        let coll
        let emittedColl
        let debt
        let emittedDebt

        // validation
        for (let i = 0; i < transactions.length; i++) {
          tx = (await openTrove(contracts, transactions[i])).tx

          coll = await getTroveEntireColl(contracts, transactions[i].sender)
          emittedColl = await getEventArgByName(tx, abi, "TroveUpdated", 2)
          expect(coll).to.equal(emittedColl)

          debt = await getTroveEntireDebt(contracts, transactions[i].sender)
          emittedDebt = await getEventArgByName(tx, abi, "TroveUpdated", 1)
          expect(debt).to.equal(emittedDebt)
        }

        // system state change via Tester functionality
        const baseRateBefore = await contracts.troveManager.baseRate()

        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        expect(await contracts.troveManager.baseRate()).to.be.greaterThan(
          baseRateBefore,
        )

        // data setup
        transactions = [
          {
            musdAmount: "5,000",
            sender: dennis,
          },
          {
            musdAmount: "3,000",
            sender: eric,
          },
        ]

        // validation
        for (let i = 0; i < transactions.length; i++) {
          tx = (await openTrove(contracts, transactions[i])).tx

          coll = await getTroveEntireColl(contracts, transactions[i].sender)
          emittedColl = await getEventArgByName(tx, abi, "TroveUpdated", 2)
          expect(coll).to.equal(emittedColl)

          debt = await getTroveEntireDebt(contracts, transactions[i].sender)
          emittedDebt = await getEventArgByName(tx, abi, "TroveUpdated", 1)
          expect(debt).to.equal(emittedDebt)
        }
      })
    })

    /**
     *
     * System State Changes
     *
     */

    context("System State Changes", () => {
      it("openTrove(): Decays a non-zero base rate", async () => {
        // setup
        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        // Check baseRate is now non-zero
        const baseRate1 = await contracts.troveManager.baseRate()
        expect(baseRate1).is.equal(newRate)

        // 2 hours pass
        await fastForwardTime(7200)

        // Dennis opens trove
        await openTrove(contracts, {
          musdAmount: "2,037",
          sender: dennis,
        })

        // Check baseRate has decreased
        const baseRate2 = await contracts.troveManager.baseRate()
        expect(baseRate2).is.lessThan(baseRate1)

        // 1 hour passes
        await fastForwardTime(3600)

        // Eric opens trove
        await openTrove(contracts, {
          musdAmount: "2,012",
          sender: eric,
        })

        const baseRate3 = await contracts.troveManager.baseRate()
        expect(baseRate3).is.lessThan(baseRate2)
      })

      it("openTrove(): Doesn't change base rate if it is already zero", async () => {
        // setup
        await defaultTrovesSetup()

        // Check baseRate is zero
        const baseRate1 = await contracts.troveManager.baseRate()
        expect(baseRate1).to.equal(0)

        // 2 hours pass
        await fastForwardTime(7200)

        // Dennis opens trove
        await openTrove(contracts, {
          musdAmount: "2,037",
          sender: dennis,
        })

        // Check baseRate is still 0
        const baseRate2 = await contracts.troveManager.baseRate()
        expect(baseRate2).to.equal(0)

        // 1 hour passes
        await fastForwardTime(3600)

        // Eric opens trove
        await openTrove(contracts, {
          musdAmount: "2,012",
          sender: eric,
        })

        const baseRate3 = await contracts.troveManager.baseRate()
        expect(baseRate3).to.equal(0)
      })

      it("openTrove(): Doesn't update lastFeeOpTime if less time than decay interval has passed since the last fee operation", async () => {
        // setup
        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)
        const lastFeeOpTime1 =
          await contracts.troveManager.lastFeeOperationTime()

        // Dennis triggers a fee
        await openTrove(contracts, {
          musdAmount: "2,001",
          sender: dennis,
        })
        const lastFeeOpTime2 =
          await contracts.troveManager.lastFeeOperationTime()

        // Check that the last fee operation time did not update, as borrower D's debt issuance occured
        // since before minimum interval had passed
        expect(lastFeeOpTime2).to.equal(lastFeeOpTime1)

        // 1 minute passes
        await fastForwardTime(60)

        // Check that now, at least one minute has passed since lastFeeOpTime_1
        const timeNow = await getLatestBlockTimestamp()
        expect(timeNow).to.equal(lastFeeOpTime1 + 61n)

        // Eric triggers a fee
        await openTrove(contracts, {
          musdAmount: "2,001",
          sender: eric,
        })
        const lastFeeOpTime3 =
          await contracts.troveManager.lastFeeOperationTime()

        // Check that the last fee operation time DID update, as borrower's debt issuance occured
        // after minimum interval had passed
        expect(lastFeeOpTime3).to.greaterThan(lastFeeOpTime1)
      })

      it("openTrove(): Borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
        // setup
        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        // 59 minutes pass
        fastForwardTime(3540)

        // Assume Borrower also owns accounts D and E

        // Borrower triggers a fee, before 60 minute decay interval has passed
        await openTrove(contracts, {
          musdAmount: "20,000",
          sender: dennis,
        })

        // 1 minute pass
        fastForwardTime(60)

        // Borrower triggers another fee
        await openTrove(contracts, {
          musdAmount: "20,000",
          sender: eric,
        })

        // Check base rate has decreased even though Borrower tried to stop it decaying
        const baseRate = await contracts.troveManager.baseRate()
        expect(baseRate).is.lessThan(newRate)
      })
    })

    /**
     *
     * Individual Troves
     *
     */

    context("Individual Troves", () => {
      it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
        const { tx } = await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: alice,
        })

        const abi = [
          // Add your contract ABI here
          "event TroveUpdated(address indexed borrower, uint256 debt, uint256 coll, uint256 stake, uint8 operation)",
        ]

        const coll = await getTroveEntireColl(contracts, alice)
        const emittedColl = await getEventArgByName(tx, abi, "TroveUpdated", 2)
        expect(coll).to.equal(emittedColl)
        expect(coll).to.greaterThan(0)

        const debt = await getTroveEntireDebt(contracts, alice)
        const emittedDebt = await getEventArgByName(tx, abi, "TroveUpdated", 1)
        expect(debt).to.equal(emittedDebt)
        expect(debt).to.greaterThan(0)

        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          true,
        )

        await openTrove(contracts, {
          musdAmount: "477,898,980,000",
          sender: eric,
        })
        expect(await contracts.sortedTroves.contains(eric.address)).to.equal(
          true,
        )
      })

      it("openTrove(): Succeeds when fee is less than max fee percentage", async () => {
        // setup
        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        // Attempt with maxFee > 5%
        await openTrove(contracts, {
          musdAmount: "10,000",
          sender: dennis,
          maxFeePercentage: "5.0000000000000001",
        })
        expect(await contracts.musd.balanceOf(dennis)).to.equal(
          to1e18("10,000"),
        )

        // Attempt with maxFee 100%
        await openTrove(contracts, {
          musdAmount: "20,000",
          sender: eric,
          maxFeePercentage: "100",
        })
        expect(await contracts.musd.balanceOf(eric)).to.equal(to1e18("20,000"))
      })

      it("openTrove(): Borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
        const abi = [
          // Add your contract ABI here
          "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
        ]

        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        fastForwardTime(7200)

        const { tx } = await openTrove(contracts, {
          musdAmount: "20,000",
          sender: dennis,
        })

        const emittedFee = await getEventArgByName(
          tx,
          abi,
          "MUSDBorrowingFeePaid",
          1,
        )
        expect(emittedFee).to.greaterThan(0)

        const newDebt = (
          await contracts.troveManager.Troves(addresses.dennis)
        )[0]

        // Check debt on Trove struct equals drawn debt plus emitted fee
        expect(newDebt).is.equal(
          emittedFee + MUSD_GAS_COMPENSATION + to1e18(20000),
        )
      })

      it("openTrove(): Creates a new Trove and assigns the correct collateral and debt amount", async () => {
        // TODO requires other contract functionality
        const debtBefore = await getTroveEntireDebt(contracts, alice)
        const collBefore = await getTroveEntireColl(contracts, alice)
        const statusBefore = await contracts.troveManager.getTroveStatus(alice)

        // check coll and debt before
        expect(debtBefore).is.equal(0)
        expect(collBefore).is.equal(0)
        // check non-existent status
        expect(statusBefore).is.equal(0)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: alice,
        })

        // Get the expected debt based on the THUSD request (adding fee and liq. reserve on top)
        const expectedDebt =
          MIN_NET_DEBT +
          (await contracts.troveManager.getBorrowingFee(MIN_NET_DEBT)) +
          MUSD_GAS_COMPENSATION

        const debtAfter = await getTroveEntireDebt(contracts, alice)
        const collAfter = await getTroveEntireColl(contracts, alice)
        const statusAfter = await contracts.troveManager.getTroveStatus(alice)

        expect(collAfter).is.greaterThan(collBefore)
        expect(debtAfter).is.greaterThan(debtBefore)
        expect(debtAfter).is.equal(expectedDebt)
        // check active status
        expect(statusAfter).is.equal(1n)
      })

      it("openTrove(): Allows a user to open a Trove, then close it, then re-open it", async () => {
        // TODO requires other contract functionality
        await lowCRSetup()

        // Check trove is active
        const aliceTrove = await contracts.troveManager.Troves(addresses.alice)
        const status = aliceTrove[3]
        expect(status).to.equal(1)
        expect(await contracts.sortedTroves.contains(addresses.alice))

        // Send MUSD to Alice so she has sufficent funds to close the trove
        await contracts.musd
          .connect(bob)
          .transfer(alice.address, to1e18("10,000"))

        // Repay and close Trove
        await contracts.borrowerOperations.connect(alice).closeTrove()

        // Check Alices trove is closed
        let trove = await contracts.troveManager.Troves(addresses.alice)
        expect(trove[3]).is.equal(2)
        expect(await contracts.sortedTroves.contains(addresses.alice)).to.equal(
          false,
        )

        // Re-open Trove
        await openTrove(contracts, {
          musdAmount: "5,000",
          sender: alice,
        })

        trove = await contracts.troveManager.Troves(addresses.alice)
        expect(trove[3]).is.equal(1)
        expect(await contracts.sortedTroves.contains(addresses.alice)).to.equal(
          true,
        )
      })
    })

    /**
     * Balance changes
     */
    context("Balance changes", () => {
      it("openTrove(): Increases user MUSD balance by correct amount", async () => {
        // opening balance
        const before = await contracts.musd.balanceOf(alice)
        expect(before).to.equal(0)

        await openTrove(contracts, {
          musdAmount: "100,000",
          sender: alice,
        })

        // check closing balance
        const after = await contracts.musd.balanceOf(alice)
        expect(after).to.equal(to1e18("100,000"))
      })

      it("openTrove(): Increases the Trove's MUSD debt by the correct amount", async () => {
        // TODO requires other contract functionality
      })

      it("openTrove(): Increases MUSD debt in ActivePool by the debt of the trove", async () => {
        // TODO requires other contract functionality
        // const activePool_before = await activePool.getMUSDDebt()
        // expect(activePool_before).to.equal(0)
        // await openTrove(contracts, {
        //   musdAmount: "10,000",
        //   sender: alice,
        // })
        // const aliceDebt = await contracts.troveManager.getEntireDebtAndColl(alice.address)
        // console.log("alice", aliceDebt[0])
        // expect(aliceDebt[0]).to.equal(to1e18(10000))
        // const activePool_after = await activePool.getMUSDDebt()
        // expect(activePool_after).to.equal(aliceDebt)
      })
    })

    /**
     *
     * Fees
     *
     */

    context("Fees", () => {
      it("openTrove(): Borrowing at non-zero base rate sends MUSD fee to PCV contract", async () => {
        const startBalance = await contracts.musd.balanceOf(addresses.pcv)
        expect(startBalance).to.equal(0)

        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        fastForwardTime(7200)

        // D opens trove
        await openTrove(contracts, {
          musdAmount: "40,000",
          sender: dennis,
        })

        const newBalance = await contracts.musd.balanceOf(addresses.pcv)
        expect(newBalance).is.greaterThan(startBalance)
      })

      it("openTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
        const startBalance = await contracts.musd.balanceOf(addresses.dennis)
        expect(startBalance).to.equal(0)

        await defaultTrovesSetup()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        fastForwardTime(7200)

        // Dennis opens trove
        await openTrove(contracts, {
          musdAmount: "40,000",
          sender: dennis,
        })

        expect(await contracts.musd.balanceOf(addresses.dennis)).to.equal(
          to1e18(40000),
        )
      })

      it("openTrove(): Borrowing at zero base rate changes the PCV contract MUSD fees collected", async () => {
        expect(await contracts.troveManager.baseRate()).to.be.equal(0)
        const before = await contracts.musd.balanceOf(addresses.pcv)
        expect(before).to.be.equal(0)
        await openTrove(contracts, {
          musdAmount: "100,000",
          sender: alice,
        })
        const after = await contracts.musd.balanceOf(addresses.pcv)
        expect(after).to.be.equal(to1e18(500))
      })

      it("openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
        // TODO requires other contract functionality
      })
    })

    /**
     *
     * Asset changes
     *
     */

    context("Asset changes", () => {})

    /**
     *
     * State change in other contracts
     *
     */

    context("State change in other contracts", () => {
      it("openTrove(): Adds Trove owner to TroveOwners array", async () => {
        const before = await contracts.troveManager.getTroveOwnersCount()
        expect(before).to.equal(0n)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: alice,
        })

        const after = await contracts.troveManager.getTroveOwnersCount()
        expect(after).to.equal(1n)
      })

      it("openTrove(): Creates a stake and adds it to total stakes", async () => {
        const before = await contracts.troveManager.getTroveStake(
          addresses.alice,
        )
        const totalBefore = await contracts.troveManager.totalStakes()

        expect(before).to.equal(0n)
        expect(totalBefore).to.equal(0n)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: alice,
        })

        const after = await contracts.troveManager.getTroveStake(
          addresses.alice,
        )
        const collAfter = await getTroveEntireColl(contracts, alice)
        const totalAfter = await contracts.troveManager.totalStakes()

        expect(collAfter).is.greaterThan(0n)
        expect(after).to.equal(collAfter)
        expect(totalAfter).to.equal(collAfter)
      })

      it("openTrove(): Inserts Trove to Sorted Troves list", async () => {
        // Check before
        expect(await contracts.sortedTroves.contains(addresses.alice)).to.equal(
          false,
        )
        expect(await contracts.sortedTroves.isEmpty()).to.equal(true)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: alice,
        })

        // Check after
        expect(await contracts.sortedTroves.contains(addresses.alice)).to.equal(
          true,
        )
        expect(await contracts.sortedTroves.isEmpty()).to.equal(false)
      })

      it("openTrove(): Increases the activePool collateral and raw collateral balance by correct amount", async () => {
        expect(await contracts.activePool.getCollateralBalance()).to.equal(0)
        expect(await ethers.provider.getBalance(addresses.activePool)).to.equal(
          0,
        )

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: alice,
        })

        expect(await getTroveEntireColl(contracts, alice)).to.equal(
          await contracts.activePool.getCollateralBalance(),
        )
        expect(await getTroveEntireColl(contracts, alice)).to.equal(
          await ethers.provider.getBalance(addresses.activePool),
        )
      })

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
})
