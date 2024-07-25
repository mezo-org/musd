import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect, assert } from "chai"
import { ethers } from "hardhat"
import {
  Contracts,
  TestSetup,
  TestingAddresses,
  User,
  addColl,
  connectContracts,
  fixture,
  fastForwardTime,
  getEventArgByName,
  getLatestBlockTimestamp,
  getTCR,
  getTroveEntireColl,
  getTroveEntireDebt,
  getAddresses,
  openTrove,
  removeMintlist,
  updateTroveSnapshot,
  updateRewardSnapshot,
  updatePendingSnapshot,
} from "../../helpers"
import { to1e18 } from "../../utils"
import { ContractsState, OpenTroveParams } from "../../helpers/interfaces"

describe("BorrowerOperations in Normal Mode", () => {
  let addresses: TestingAddresses
  // users
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let deployer: User
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let state: ContractsState
  let testSetup: TestSetup
  let MIN_NET_DEBT: bigint
  let MUSD_GAS_COMPENSATION: bigint

  async function checkOpenTroveEvents(
    transactions: OpenTroveParams[],
    abi: string[],
  ) {
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
      expect(coll).to.greaterThan(0)

      debt = await getTroveEntireDebt(contracts, transactions[i].sender)
      emittedDebt = await getEventArgByName(tx, abi, "TroveUpdated", 1)
      expect(debt).to.equal(emittedDebt)
      expect(debt).to.greaterThan(0)
    }
  }

  async function defaultTrovesSetup() {
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
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    state = testSetup.state

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

    await defaultTrovesSetup()
  })

  describe("Initial State", () => {
    it("name(): Returns the contract's name", async () => {
      expect(await contracts.borrowerOperations.name()).to.equal(
        "BorrowerOperations",
      )
    })
  })

  describe("openTrove()", () => {
    /**
     *
     * Expected Reverts
     *
     */

    context("Expected Reverts", () => {
      it("openTrove(): Reverts when BorrowerOperations address is not in mintlist", async () => {
        // remove mintlist
        await removeMintlist(contracts, deployer.wallet)
        await expect(
          openTrove(contracts, {
            musdAmount: "100,000",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith("MUSD: Caller not allowed to mint")
      })

      it("openTrove(): Reverts if amount to borrow is zero", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "0",
            sender: carol.wallet,
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
            sender: carol.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: Trove's net debt must be greater than minimum",
        )
      })

      it("openTrove(): Reverts if max fee > 100%", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: carol.wallet,
            maxFeePercentage: "101",
          }),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("openTrove(): Reverts if max fee < 0.5% in Normal mode", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: carol.wallet,
            maxFeePercentage: "0",
          }),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")

        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: carol.wallet,
            maxFeePercentage: "0.4999999999999999",
          }),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("openTrove(): Reverts if fee exceeds max fee percentage", async () => {
        // setup
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        // actual fee percentage: 0.05000000186264514
        // user's max fee percentage:  0.005

        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: carol.wallet,
            maxFeePercentage: "0.5",
          }),
        ).to.be.revertedWith("Fee exceeded provided maximum")
      })

      it("openTrove(): Reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
        const TCR = await getTCR(contracts)
        assert.equal(TCR, to1e18(150) / 100n)

        // Carol attempts to open a trove with ICR = 149%
        // System TCR would fall below 150%
        await expect(
          openTrove(contracts, {
            musdAmount: "5,000",
            ICR: "149",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in TCR < CCR is not permitted",
        )
      })

      it("openTrove(): Reverts if trove is already active", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: alice.wallet,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove is active")
      })

      it("openTrove(): Reverts when trove ICR < MCR", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            ICR: "109",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })
    })

    /**
     *
     * Emitted Events
     *
     */

    context("Emitted Events", () => {
      it("openTrove(): Emits a TroveUpdated event with the correct collateral and debt", async () => {
        const abi = [
          // Add your contract ABI here
          "event TroveUpdated(address indexed borrower, uint256 debt, uint256 coll, uint256 stake, uint8 operation)",
        ]

        // data setup
        const transactions = [
          {
            musdAmount: "3,000",
            sender: carol.wallet,
          },
        ]

        await checkOpenTroveEvents(transactions, abi)
      })

      it("openTrove(): Emits a TroveUpdated event with the correct collateral and debt after changed baseRate", async () => {
        const abi = [
          // Add your contract ABI here
          "event TroveUpdated(address indexed borrower, uint256 debt, uint256 coll, uint256 stake, uint8 operation)",
        ]

        // system state change via Tester functionality
        const baseRateBefore = await contracts.troveManager.baseRate()
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)
        expect(await contracts.troveManager.baseRate()).to.be.greaterThan(
          baseRateBefore,
        )

        // data setup
        const transactions = [
          {
            musdAmount: "5,000",
            sender: dennis.wallet,
          },
          {
            musdAmount: "3,000",
            sender: eric.wallet,
          },
        ]
        await checkOpenTroveEvents(transactions, abi)
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
          sender: dennis.wallet,
        })

        // Check baseRate has decreased
        const baseRate2 = await contracts.troveManager.baseRate()
        expect(baseRate2).is.lessThan(baseRate1)

        // 1 hour passes
        await fastForwardTime(3600)

        // Eric opens trove
        await openTrove(contracts, {
          musdAmount: "2,012",
          sender: eric.wallet,
        })

        const baseRate3 = await contracts.troveManager.baseRate()
        expect(baseRate3).is.lessThan(baseRate2)
      })

      it("openTrove(): Doesn't change base rate if it is already zero", async () => {
        // Check baseRate is zero
        expect(await contracts.troveManager.baseRate()).to.equal(0)

        // 2 hours pass
        await fastForwardTime(7200)

        // Dennis opens trove
        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: dennis.wallet,
        })

        // Check baseRate is still 0
        expect(await contracts.troveManager.baseRate()).to.equal(0)

        // 1 hour passes
        await fastForwardTime(3600)

        // Eric opens trove
        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: eric.wallet,
        })

        expect(await contracts.troveManager.baseRate()).to.equal(0)
      })

      it("openTrove(): Doesn't update lastFeeOpTime if less time than decay interval has passed since the last fee operation", async () => {
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)
        const lastFeeOpTime1 =
          await contracts.troveManager.lastFeeOperationTime()

        // Dennis triggers a fee
        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: dennis.wallet,
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
        expect(BigInt(timeNow)).to.be.oneOf([
          lastFeeOpTime1 + 60n,
          lastFeeOpTime1 + 61n,
          lastFeeOpTime1 + 62n,
        ])

        // Eric triggers a fee
        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: eric.wallet,
        })
        const lastFeeOpTime3 =
          await contracts.troveManager.lastFeeOperationTime()

        // Check that the last fee operation time DID update, as borrower's debt issuance occured
        // after minimum interval had passed
        expect(lastFeeOpTime3).to.greaterThan(lastFeeOpTime1)
      })

      it("openTrove(): Borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        // 59 minutes pass
        fastForwardTime(3540)

        // Borrower triggers a fee, before 60 minute decay interval has passed
        await openTrove(contracts, {
          musdAmount: "20,000",
          sender: dennis.wallet,
        })

        // 1 minute pass
        fastForwardTime(60)

        // Borrower triggers another fee
        await openTrove(contracts, {
          musdAmount: "20,000",
          sender: eric.wallet,
        })

        // Check base rate has decreased even though Borrower tried to stop it decaying
        expect(await contracts.troveManager.baseRate()).is.lessThan(newRate)
      })
    })

    /**
     *
     * Individual Troves
     *
     */

    context("Individual Troves", () => {
      it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
          true,
        )

        await openTrove(contracts, {
          musdAmount: "477,898,980",
          sender: eric.wallet,
        })
        expect(await contracts.sortedTroves.contains(eric.address)).to.equal(
          true,
        )
      })

      it("openTrove(): Succeeds when fee is less than max fee percentage", async () => {
        // setup
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        // Attempt with maxFee > 5%
        await openTrove(contracts, {
          musdAmount: "10,000",
          sender: dennis.wallet,
          maxFeePercentage: "5.0000000000000001",
        })
        expect(await contracts.musd.balanceOf(dennis.wallet)).to.equal(
          to1e18("10,000"),
        )

        // Attempt with maxFee 100%
        await openTrove(contracts, {
          musdAmount: "20,000",
          sender: eric.wallet,
          maxFeePercentage: "100",
        })
        expect(await contracts.musd.balanceOf(eric.wallet)).to.equal(
          to1e18("20,000"),
        )
      })

      it("openTrove(): Borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
        const abi = [
          // Add your contract ABI here
          "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
        ]

        const musdAmount = to1e18("20,000")
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        fastForwardTime(7200)

        const { tx } = await openTrove(contracts, {
          musdAmount,
          sender: dennis.wallet,
        })

        const emittedFee = await getEventArgByName(
          tx,
          abi,
          "MUSDBorrowingFeePaid",
          1,
        )
        expect(emittedFee).to.greaterThan(0)

        await updateTroveSnapshot(contracts, dennis, "after")

        // Check debt on Trove struct equals drawn debt plus emitted fee
        expect(dennis.trove.debt.after).is.equal(
          emittedFee + MUSD_GAS_COMPENSATION + musdAmount,
        )
      })

      it("openTrove(): Creates a new Trove and assigns the correct collateral and debt amount", async () => {
        await updateTroveSnapshot(contracts, carol, "before")

        expect(carol.trove.debt.before).is.equal(0)
        expect(carol.trove.collateral.before).is.equal(0)
        expect(carol.trove.status.before).is.equal(0)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        // Get the expected debt based on the THUSD request (adding fee and liq. reserve on top)
        const expectedDebt =
          MIN_NET_DEBT +
          (await contracts.troveManager.getBorrowingFee(MIN_NET_DEBT)) +
          MUSD_GAS_COMPENSATION

        await updateTroveSnapshot(contracts, carol, "after")

        expect(carol.trove.collateral.after).is.greaterThan(
          carol.trove.collateral.before,
        )
        expect(carol.trove.debt.after).is.greaterThan(carol.trove.debt.before)
        expect(carol.trove.debt.after).is.equal(expectedDebt)
        expect(carol.trove.status.after).is.equal(1n)
      })

      it("openTrove(): Allows a user to open a Trove, then close it, then re-open it", async () => {
        // Send MUSD to Alice so she has sufficent funds to close the trove
        await contracts.musd
          .connect(bob.wallet)
          .transfer(alice.address, to1e18("10,000"))

        // Repay and close Trove
        await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
        await updateTroveSnapshot(contracts, alice, "before")

        // Check Alices trove is closed
        expect(alice.trove.status.before).is.equal(2)
        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          false,
        )

        // Re-open Trove
        await openTrove(contracts, {
          musdAmount: "5,000",
          sender: alice.wallet,
        })

        await updateTroveSnapshot(contracts, alice, "after")
        expect(alice.trove.status.after).is.equal(1)
        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          true,
        )
      })
    })

    /**
     * Balance changes
     */

    context("Balance changes", () => {
      it("openTrove(): Increases user MUSD balance by correct amount", async () => {
        expect(await contracts.musd.balanceOf(carol.wallet)).to.equal(0)

        const musdAmount = to1e18("100,000")
        await openTrove(contracts, {
          musdAmount,
          sender: carol.wallet,
        })

        expect(await contracts.musd.balanceOf(carol.wallet)).to.equal(
          musdAmount,
        )
      })

      it("openTrove(): Increases the Trove's MUSD debt by the correct amount", async () => {
        const abi = [
          // Add your contract ABI here
          "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
        ]

        await updateTroveSnapshot(contracts, dennis, "before")
        expect(dennis.trove.debt.before).to.equal(0n)

        const { tx } = await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: dennis.wallet,
        })

        const emittedFee = await getEventArgByName(
          tx,
          abi,
          "MUSDBorrowingFeePaid",
          1,
        )
        await updateTroveSnapshot(contracts, dennis, "after")
        expect(dennis.trove.debt.after).to.equal(
          MIN_NET_DEBT + MUSD_GAS_COMPENSATION + emittedFee,
        )
      })

      it("openTrove(): Increases MUSD debt in ActivePool by the debt of the trove", async () => {
        const debtBefore = await contracts.activePool.getMUSDDebt()

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        await updateTroveSnapshot(contracts, carol, "after")
        expect(await contracts.activePool.getMUSDDebt()).to.equal(
          carol.trove.debt.after + debtBefore,
        )

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: dennis.wallet,
        })

        await updateTroveSnapshot(contracts, dennis, "after")
        expect(await contracts.activePool.getMUSDDebt()).to.equal(
          dennis.trove.debt.after + carol.trove.debt.after + debtBefore,
        )
      })
    })

    /**
     *
     * Fees
     *
     */

    context("Fees", () => {
      it("openTrove(): Borrowing at non-zero base rate sends MUSD fee to PCV contract", async () => {
        state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)

        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        fastForwardTime(7200)

        await openTrove(contracts, {
          musdAmount: "40,000",
          sender: dennis.wallet,
        })

        state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)
        expect(state.pcv.musd.after).is.greaterThan(state.pcv.musd.before)
      })

      it("openTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
        dennis.musd.before = await contracts.musd.balanceOf(dennis.address)
        expect(dennis.musd.before).to.equal(0)

        const musdAmount = to1e18("40,000")
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        fastForwardTime(7200)

        // Dennis opens trove
        await openTrove(contracts, {
          musdAmount,
          sender: dennis.wallet,
        })

        dennis.musd.after = await contracts.musd.balanceOf(dennis.address)
        expect(dennis.musd.after).to.equal(musdAmount)
      })

      it("openTrove(): Borrowing at zero base rate changes the PCV contract MUSD fees collected", async () => {
        state.troveManager.baseRate.before =
          await contracts.troveManager.baseRate()
        expect(state.troveManager.baseRate.before).to.be.equal(0)
        state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)

        await openTrove(contracts, {
          musdAmount: "100,000",
          sender: carol.wallet,
        })

        state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)
        expect(state.pcv.musd.after).to.be.equal(
          to1e18(500) + state.pcv.musd.before,
        )
      })

      it("openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
        const abi = [
          // Add your contract ABI here
          "event MUSDBorrowingFeePaid(address indexed sender, uint256 fee)",
        ]

        const { tx } = await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        const emittedFee = await getEventArgByName(
          tx,
          abi,
          "MUSDBorrowingFeePaid",
          1,
        )

        const BORROWING_FEE_FLOOR =
          await contracts.borrowerOperations.BORROWING_FEE_FLOOR()
        const expectedFee =
          (BORROWING_FEE_FLOOR * MIN_NET_DEBT) / 1000000000000000000n
        expect(expectedFee).to.equal(emittedFee)
      })
    })

    /**
     *
     * State change in other contracts
     *
     */

    context("State change in other contracts", () => {
      it("openTrove(): Adds Trove owner to TroveOwners array", async () => {
        state.troveManager.troves.before =
          await contracts.troveManager.getTroveOwnersCount()
        expect(state.troveManager.troves.before).to.equal(2n)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        state.troveManager.troves.after =
          await contracts.troveManager.getTroveOwnersCount()
        expect(state.troveManager.troves.after).to.equal(3n)
      })

      it("openTrove(): Creates a stake and adds it to total stakes", async () => {
        state.troveManager.stakes.before =
          await contracts.troveManager.totalStakes()

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        await updateTroveSnapshot(contracts, carol, "after")

        state.troveManager.stakes.after =
          await contracts.troveManager.totalStakes()
        expect(state.troveManager.stakes.after).to.equal(
          carol.trove.stake.after + state.troveManager.stakes.before,
        )
      })

      it("openTrove(): Inserts Trove to Sorted Troves list", async () => {
        expect(await contracts.sortedTroves.contains(carol.address)).to.equal(
          false,
        )

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        expect(await contracts.sortedTroves.contains(carol.address)).to.equal(
          true,
        )
      })

      it("openTrove(): Increases the activePool collateral and raw collateral balance by correct amount", async () => {
        state.activePool.collateral.before =
          await contracts.activePool.getCollateralBalance()
        state.activePool.btc.before = await ethers.provider.getBalance(
          addresses.activePool,
        )

        expect(state.activePool.btc.before).to.equal(
          state.activePool.collateral.before,
        )

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        await updateTroveSnapshot(contracts, carol, "after")

        const expectedCollateral =
          carol.trove.collateral.after + state.activePool.collateral.before
        state.activePool.collateral.after =
          await contracts.activePool.getCollateralBalance()
        state.activePool.btc.after = await ethers.provider.getBalance(
          addresses.activePool,
        )

        expect(state.activePool.collateral.after).to.equal(expectedCollateral)
        expect(state.activePool.btc.after).to.equal(expectedCollateral)
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
      it("addColl(), reverts if trove is non-existent or closed", async () => {
        await expect(
          addColl(contracts, {
            amount: to1e18(1),
            sender: carol.wallet,
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
      it("addColl(), active Trove: adds the correct collateral amount to the Trove", async () => {
        await updateTroveSnapshot(contracts, alice, "before")
        expect(alice.trove.status.before).to.equal(1) // status

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        await updateTroveSnapshot(contracts, alice, "after")
        expect(alice.trove.status.after).to.equal(1) // status
        expect(alice.trove.collateral.after).to.equal(
          alice.trove.collateral.before + collateralTopUp,
        )
      })

      it("addColl(), active Trove: Trove is in sortedList before and after", async () => {
        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          true,
        )
        expect(await contracts.sortedTroves.isEmpty()).to.equal(false)

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          true,
        )
        expect(await contracts.sortedTroves.isEmpty()).to.equal(false)
      })

      it("addColl(), active Trove: updates the stake and updates the total stakes", async () => {
        await updateTroveSnapshot(contracts, alice, "before")
        state.troveManager.stakes.before =
          await contracts.troveManager.totalStakes()

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        await updateTroveSnapshot(contracts, alice, "after")
        state.troveManager.stakes.after =
          await contracts.troveManager.totalStakes()

        expect(state.troveManager.stakes.after).is.equal(
          state.troveManager.stakes.before +
            alice.trove.stake.after -
            alice.trove.stake.before,
        )
        expect(state.troveManager.stakes.after).to.equal(
          state.troveManager.stakes.before + collateralTopUp,
        )
      })
    })

    /**
     *
     *  Balance changes
     *
     */

    context("Balance changes", () => {
      it("addColl(): no mintlist, can add collateral", async () => {
        await updateTroveSnapshot(contracts, alice, "before")
        await removeMintlist(contracts, deployer.wallet)

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        await updateTroveSnapshot(contracts, alice, "after")
        expect(alice.trove.collateral.after).to.equal(
          alice.trove.collateral.before + collateralTopUp,
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

    context("State change in other contracts", () => {
      it("addColl(): increases the activePool collateral and raw collateral balance by correct amount", async () => {
        const beforeCollateral = await ethers.provider.getBalance(
          addresses.activePool,
        )
        expect(beforeCollateral).to.equal(
          await contracts.activePool.getCollateralBalance(),
        )

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        const afterCollateral = await ethers.provider.getBalance(
          addresses.activePool,
        )
        expect(afterCollateral).to.equal(
          await contracts.activePool.getCollateralBalance(),
        )
        expect(afterCollateral).to.equal(beforeCollateral + collateralTopUp)
      })
    })
  })

  describe("withdrawColl()", () => {
    /**
     *
     * Expected Reverts
     *
     */

    context("Expected Reverts", () => {
      it("withdrawColl(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
        const price = await contracts.priceFeed.fetchPrice()
        await updateTroveSnapshot(contracts, alice, "before")
        expect(
          await contracts.troveManager.getCurrentICR(alice.wallet, price),
        ).to.equal(to1e18(1.5))
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .withdrawColl(
              alice.trove.collateral.before / 2n,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("withdrawColl(): no mintlist, reverts when withdrawal would leave trove with ICR < MCR", async () => {
        await removeMintlist(contracts, deployer.wallet)

        const price = await contracts.priceFeed.fetchPrice()
        await updateTroveSnapshot(contracts, alice, "before")
        expect(
          await contracts.troveManager.getCurrentICR(alice.wallet, price),
        ).to.equal(to1e18(1.5))
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .withdrawColl(
              alice.trove.collateral.before / 2n,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      // reverts when calling address does not have active trove
      it("withdrawColl(): reverts when calling address does not have active trove", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .withdrawColl(1n, carol.wallet, carol.wallet),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("withdrawColl(): reverts when requested collateral withdrawal is > the trove's collateral", async () => {
        await updateTroveSnapshot(contracts, alice, "before")
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .withdrawColl(
              alice.trove.collateral.before + 1n,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWithPanic()
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
      it("withdrawColl(): updates the stake and updates the total stakes", async () => {
        await openTrove(contracts, {
          musdAmount: "5,000",
          ICR: "200",
          sender: carol.wallet,
        })
        await updateTroveSnapshot(contracts, alice, "before")
        await updateTroveSnapshot(contracts, bob, "before")
        await updateTroveSnapshot(contracts, carol, "before")

        state.troveManager.stakes.before =
          await contracts.troveManager.totalStakes()

        expect(carol.trove.stake.before).to.equal(carol.trove.collateral.before)
        expect(
          alice.trove.stake.before +
            bob.trove.stake.before +
            carol.trove.stake.before,
        ).to.equal(state.troveManager.stakes.before)

        const withdrawalAmount = 1n
        await contracts.borrowerOperations
          .connect(carol.wallet)
          .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet)
        await updateTroveSnapshot(contracts, carol, "after")

        state.troveManager.stakes.after =
          await contracts.troveManager.totalStakes()
        expect(
          alice.trove.stake.before +
            bob.trove.stake.before +
            carol.trove.stake.after,
        ).to.equal(state.troveManager.stakes.after)
        expect(carol.trove.stake.after).to.equal(
          carol.trove.stake.before - withdrawalAmount,
        )
        expect(carol.trove.collateral.after).to.equal(
          carol.trove.collateral.before - withdrawalAmount,
        )
      })
    })

    /**
     *
     * Individual Troves
     *
     */

    context("Individual Troves", () => {
      it("withdrawColl(): leaves the Trove active when the user withdraws less than all the collateral", async () => {
        await openTrove(contracts, {
          musdAmount: "5,000",
          ICR: "200",
          sender: carol.wallet,
        })

        const withdrawalAmount = 1n
        await contracts.borrowerOperations
          .connect(carol.wallet)
          .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet)

        await updateTroveSnapshot(contracts, carol, "after")

        expect(carol.trove.status.after).to.equal(1)
        expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
          true,
        )
      })

      it("withdrawColl(): reduces the Trove's collateral by the correct amount", async () => {
        await openTrove(contracts, {
          musdAmount: "5,000",
          ICR: "200",
          sender: carol.wallet,
        })

        const withdrawalAmount = 1n
        await updateTroveSnapshot(contracts, carol, "before")
        await contracts.borrowerOperations
          .connect(carol.wallet)
          .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet)
        await updateTroveSnapshot(contracts, carol, "after")

        expect(carol.trove.collateral.after).to.equal(
          carol.trove.collateral.before - withdrawalAmount,
        )
      })
    })

    /**
     *
     *  Balance changes
     *
     */

    context("Balance changes", () => {
      it("withdrawColl(): sends the correct amount of collateral to the user", async () => {
        await openTrove(contracts, {
          musdAmount: "5,000",
          ICR: "1000",
          sender: carol.wallet,
        })

        const withdrawalAmount = to1e18("0.5")

        carol.btc.before = await ethers.provider.getBalance(carol.address)
        await contracts.borrowerOperations
          .connect(carol.wallet)
          .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet, {
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
          })
        carol.btc.after = await ethers.provider.getBalance(carol.address)

        expect(carol.btc.after).to.equal(carol.btc.before + withdrawalAmount)
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
      it("withdrawColl(): reduces ActivePool collateral and raw collateral by correct amount", async () => {
        await openTrove(contracts, {
          musdAmount: "5,000",
          ICR: "1000",
          sender: carol.wallet,
        })

        const withdrawalAmount = to1e18("0.5")
        const activePoolBalance =
          await contracts.activePool.getCollateralBalance()
        await contracts.borrowerOperations
          .connect(carol.wallet)
          .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet)
        const newActivePoolBalance =
          await contracts.activePool.getCollateralBalance()

        expect(newActivePoolBalance).to.equal(
          activePoolBalance - withdrawalAmount,
        )
      })

      it("withdrawColl(): applies pending rewards and updates user's L_Collateral, L_THUSDDebt snapshots", async () => {
        await openTrove(contracts, {
          musdAmount: "50,000",
          ICR: "1000",
          sender: carol.wallet,
        })

        await openTrove(contracts, {
          musdAmount: "15,000",
          ICR: "1000",
          sender: dennis.wallet,
        })

        await updateTroveSnapshot(contracts, carol, "before")
        await updateTroveSnapshot(contracts, dennis, "before")

        // Make Alice subject to liquidation
        const price = to1e18("25,000")
        await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)

        // liquidate Alice
        await contracts.troveManager
          .connect(deployer.wallet)
          .liquidate(alice.wallet)

        state.troveManager.liquidation.collateral.before =
          await contracts.troveManager.L_Collateral()
        state.troveManager.liquidation.debt.before =
          await contracts.troveManager.L_MUSDDebt()

        await updateRewardSnapshot(contracts, carol, "before")
        await updateRewardSnapshot(contracts, dennis, "before")
        await updatePendingSnapshot(contracts, carol, "before")
        await updatePendingSnapshot(contracts, dennis, "before")

        // Check Bob and Carol have pending rewards from the liquidation
        expect(carol.pending.collateral.before).to.greaterThan(0n)
        expect(dennis.pending.collateral.before).to.greaterThan(0n)
        expect(carol.pending.debt.before).to.greaterThan(0n)
        expect(dennis.pending.debt.before).to.greaterThan(0n)

        const withdrawalAmount = 1n
        await contracts.borrowerOperations
          .connect(carol.wallet)
          .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet, {
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
          })
        await contracts.borrowerOperations
          .connect(dennis.wallet)
          .withdrawColl(withdrawalAmount, dennis.wallet, dennis.wallet, {
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
          })

        await updateTroveSnapshot(contracts, carol, "after")
        await updateTroveSnapshot(contracts, dennis, "after")

        // Check rewards have been applied to troves
        expect(carol.trove.collateral.after).to.equal(
          carol.trove.collateral.before +
            carol.pending.collateral.before -
            withdrawalAmount,
        )
        expect(dennis.trove.collateral.after).to.equal(
          dennis.trove.collateral.before +
            dennis.pending.collateral.before -
            withdrawalAmount,
        )

        await updateRewardSnapshot(contracts, carol, "after")
        await updateRewardSnapshot(contracts, dennis, "after")

        expect(carol.rewardSnapshot.collateral.after).to.equal(
          state.troveManager.liquidation.collateral.before,
        )
        expect(dennis.rewardSnapshot.collateral.after).to.equal(
          state.troveManager.liquidation.collateral.before,
        )
        expect(carol.rewardSnapshot.debt.after).to.equal(
          state.troveManager.liquidation.debt.before,
        )
        expect(dennis.rewardSnapshot.debt.after).to.equal(
          state.troveManager.liquidation.debt.before,
        )
      })
    })
  })
})
