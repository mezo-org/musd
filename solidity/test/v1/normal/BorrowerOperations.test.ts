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
} from "../../helpers"
import { to1e18 } from "../../utils"
import { OpenTroveParams } from "../../helpers/interfaces"

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

        const newDebt = (await contracts.troveManager.Troves(dennis.address))[0]

        // Check debt on Trove struct equals drawn debt plus emitted fee
        expect(newDebt).is.equal(
          emittedFee + MUSD_GAS_COMPENSATION + musdAmount,
        )
      })

      it("openTrove(): Creates a new Trove and assigns the correct collateral and debt amount", async () => {
        carol.debt.before = await getTroveEntireDebt(contracts, carol.wallet)
        carol.collateral.before = await getTroveEntireColl(
          contracts,
          carol.wallet,
        )
        const statusBefore = await contracts.troveManager.getTroveStatus(
          carol.wallet,
        )

        // check coll and debt before
        expect(carol.debt.before).is.equal(0)
        expect(carol.collateral.before).is.equal(0)
        // check non-existent status
        expect(statusBefore).is.equal(0)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        // Get the expected debt based on the THUSD request (adding fee and liq. reserve on top)
        const expectedDebt =
          MIN_NET_DEBT +
          (await contracts.troveManager.getBorrowingFee(MIN_NET_DEBT)) +
          MUSD_GAS_COMPENSATION

        carol.debt.after = await getTroveEntireDebt(contracts, carol.wallet)
        carol.collateral.after = await getTroveEntireColl(
          contracts,
          carol.wallet,
        )
        const statusAfter = await contracts.troveManager.getTroveStatus(
          carol.wallet,
        )

        expect(carol.collateral.after).is.greaterThan(carol.collateral.before)
        expect(carol.debt.after).is.greaterThan(carol.debt.before)
        expect(carol.debt.after).is.equal(expectedDebt)
        // check active status
        expect(statusAfter).is.equal(1n)
      })

      it("openTrove(): Allows a user to open a Trove, then close it, then re-open it", async () => {
        // Check trove is active
        expect(
          (await contracts.troveManager.Troves(alice.address))[3],
        ).to.equal(1)
        expect(await contracts.sortedTroves.contains(alice.address))

        // Send MUSD to Alice so she has sufficent funds to close the trove
        await contracts.musd
          .connect(bob.wallet)
          .transfer(alice.address, to1e18("10,000"))

        // Repay and close Trove
        await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

        // Check Alices trove is closed
        expect(
          (await contracts.troveManager.Troves(alice.address))[3],
        ).is.equal(2)
        expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
          false,
        )

        // Re-open Trove
        await openTrove(contracts, {
          musdAmount: "5,000",
          sender: alice.wallet,
        })

        expect(
          (await contracts.troveManager.Troves(alice.address))[3],
        ).is.equal(1)
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

        expect(await getTroveEntireDebt(contracts, dennis.wallet)).to.equal(0n)

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
        expect(await getTroveEntireDebt(contracts, dennis.wallet)).to.equal(
          MIN_NET_DEBT + MUSD_GAS_COMPENSATION + emittedFee,
        )
      })

      it("openTrove(): Increases MUSD debt in ActivePool by the debt of the trove", async () => {
        const debtBefore = await contracts.activePool.getMUSDDebt()

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        carol.debt.after = await getTroveEntireDebt(contracts, carol.wallet)
        expect(await contracts.activePool.getMUSDDebt()).to.equal(
          carol.debt.after + debtBefore,
        )

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: dennis.wallet,
        })

        dennis.debt.after = await getTroveEntireDebt(contracts, dennis.wallet)
        expect(await contracts.activePool.getMUSDDebt()).to.equal(
          dennis.debt.after + carol.debt.after + debtBefore,
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
        const pcvBefore = await contracts.musd.balanceOf(addresses.pcv)

        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

        fastForwardTime(7200)

        await openTrove(contracts, {
          musdAmount: "40,000",
          sender: dennis.wallet,
        })

        const pcvAfter = await contracts.musd.balanceOf(addresses.pcv)
        expect(pcvAfter).is.greaterThan(pcvBefore)
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
        expect(await contracts.troveManager.baseRate()).to.be.equal(0)
        const pcvBefore = await contracts.musd.balanceOf(addresses.pcv)

        await openTrove(contracts, {
          musdAmount: "100,000",
          sender: carol.wallet,
        })

        const pcvAfter = await contracts.musd.balanceOf(addresses.pcv)
        expect(pcvAfter).to.be.equal(to1e18(500) + pcvBefore)
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
        const trovesBefore = await contracts.troveManager.getTroveOwnersCount()
        expect(trovesBefore).to.equal(2n)

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        const trovesAfter = await contracts.troveManager.getTroveOwnersCount()
        expect(trovesAfter).to.equal(3n)
      })

      it("openTrove(): Creates a stake and adds it to total stakes", async () => {
        const totalStakesBefore = await contracts.troveManager.totalStakes()

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        const carolTroveStake = await contracts.troveManager.getTroveStake(
          carol.address,
        )
        carol.collateral.after = await getTroveEntireColl(
          contracts,
          carol.wallet,
        )
        expect(carolTroveStake).to.equal(carol.collateral.after)

        const totalStakesAfter = await contracts.troveManager.totalStakes()
        expect(totalStakesAfter).to.equal(carolTroveStake + totalStakesBefore)
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
        const activePoolCollateralBefore =
          await contracts.activePool.getCollateralBalance()
        expect(await ethers.provider.getBalance(addresses.activePool)).to.equal(
          activePoolCollateralBefore,
        )

        await openTrove(contracts, {
          musdAmount: MIN_NET_DEBT,
          sender: carol.wallet,
        })

        const expectedCollateral =
          (await getTroveEntireColl(contracts, carol.wallet)) +
          activePoolCollateralBefore
        expect(await contracts.activePool.getCollateralBalance()).to.equal(
          expectedCollateral,
        )
        expect(await ethers.provider.getBalance(addresses.activePool)).to.equal(
          expectedCollateral,
        )
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
        let trove = await contracts.troveManager.Troves(alice.address)
        const [, collateralBefore, , statusBefore] = trove // Destructuring the needed elements

        expect(statusBefore).to.equal(1) // status
        alice.collateral.before = collateralBefore // Accessing the collateral value

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        trove = await contracts.troveManager.Troves(alice.address)
        const [, collateralAfter, , statusAfter] = trove // Destructuring the needed elements
        expect(statusAfter).to.equal(1) // status
        alice.collateral.after = collateralAfter

        expect(alice.collateral.after).to.equal(
          alice.collateral.before + collateralTopUp,
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
        const aliceStakeBefore = (
          await contracts.troveManager.Troves(alice.address)
        )[2]
        const totalStakesBefore = await contracts.troveManager.totalStakes()

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        const aliceStakeAfter = (
          await contracts.troveManager.Troves(alice.address)
        )[2]
        const totalStakesAfter = await contracts.troveManager.totalStakes()
        expect(totalStakesAfter).is.equal(
          totalStakesBefore + aliceStakeAfter - aliceStakeBefore,
        )
        expect(totalStakesAfter).to.equal(totalStakesBefore + collateralTopUp)
      })
    })

    /**
     *
     *  Balance changes
     *
     */

    context("Balance changes", () => {
      it("addColl(): no mintlist, can add collateral", async () => {
        const aliceCollBefore = await getTroveEntireColl(
          contracts,
          alice.wallet,
        )

        await removeMintlist(contracts, deployer.wallet)

        const collateralTopUp = to1e18(1)
        await addColl(contracts, {
          amount: collateralTopUp,
          sender: alice.wallet,
        })

        const aliceCollAfter = await getTroveEntireColl(contracts, alice.wallet)
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
})
