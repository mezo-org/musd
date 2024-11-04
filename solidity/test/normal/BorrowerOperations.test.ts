import { assert, expect } from "chai"
import { ethers } from "hardhat"
import {
  NO_GAS,
  TestingAddresses,
  User,
  addColl,
  createLiquidationEvent,
  fastForwardTime,
  getEventArgByName,
  getLatestBlockTimestamp,
  getTCR,
  getTroveEntireColl,
  getTroveEntireDebt,
  openTrove,
  removeMintlist,
  setBaseRate,
  setupTests,
  updateContractsSnapshot,
  updatePendingSnapshot,
  updateRewardSnapshot,
  updateTroveManagerSnapshot,
  updateTroveSnapshot,
  updateWalletSnapshot,
  setInterestRate,
} from "../helpers"
import { to1e18 } from "../utils"
import {
  Contracts,
  ContractsState,
  OpenTroveParams,
} from "../helpers/interfaces"

describe("BorrowerOperations in Normal Mode", () => {
  let addresses: TestingAddresses
  // users
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let dennis: User
  let eric: User
  let deployer: User
  let treasury: User
  let contracts: Contracts
  let state: ContractsState
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

  async function setupCarolsTrove() {
    await openTrove(contracts, {
      musdAmount: "20,000",
      ICR: "500",
      sender: carol.wallet,
    })
  }

  async function setNewRate(rate: bigint) {
    await setBaseRate(contracts, rate)
  }

  async function setupCarolsTroveAndAdjustRate() {
    await openTrove(contracts, {
      musdAmount: "20,000",
      ICR: "500",
      sender: carol.wallet,
    })

    // Artificially make baseRate 5%
    const newRate = to1e18(5) / 100n
    await setNewRate(newRate)
  }

  beforeEach(async () => {
    ;({
      alice,
      bob,
      carol,
      council,
      dennis,
      eric,
      deployer,
      treasury,
      state,
      contracts,
      addresses,
    } = await setupTests())

    MIN_NET_DEBT = await contracts.borrowerOperations.MIN_NET_DEBT()
    MUSD_GAS_COMPENSATION =
      await contracts.borrowerOperations.MUSD_GAS_COMPENSATION()

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()

    await defaultTrovesSetup()
  })

  describe("name()", () => {
    it("Returns the contract's name", async () => {
      expect(await contracts.borrowerOperations.name()).to.equal(
        "BorrowerOperations",
      )
    })
  })

  describe("setNewRate()", () => {
    it("Changes the base", async () => {
      const baseRateBefore = await contracts.troveManager.baseRate()
      const newRate = to1e18(5) / 100n
      await setNewRate(newRate)
      expect(await contracts.troveManager.baseRate()).to.be.greaterThan(
        baseRateBefore,
      )
      expect(await contracts.troveManager.baseRate()).to.equal(newRate)
    })
  })

  describe("openTrove()", () => {
    it("Decays a non-zero base rate", async () => {
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

    it("Doesn't change base rate if it is already zero", async () => {
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

    it("Doesn't update lastFeeOpTime if less time than decay interval has passed since the last fee operation", async () => {
      const newRate = to1e18(5) / 100n
      await setNewRate(newRate)
      const lastFeeOpTime1 = await contracts.troveManager.lastFeeOperationTime()

      // Dennis triggers a fee
      await openTrove(contracts, {
        musdAmount: "2,000",
        sender: dennis.wallet,
      })
      const lastFeeOpTime2 = await contracts.troveManager.lastFeeOperationTime()

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
      const lastFeeOpTime3 = await contracts.troveManager.lastFeeOperationTime()

      // Check that the last fee operation time DID update, as borrower's debt issuance occured
      // after minimum interval had passed
      expect(lastFeeOpTime3).to.greaterThan(lastFeeOpTime1)
    })

    it("Borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
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

    it("Opens a trove with net debt >= minimum net debt", async () => {
      await openTrove(contracts, {
        musdAmount: MIN_NET_DEBT,
        sender: carol.wallet,
      })

      expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(true)

      await openTrove(contracts, {
        musdAmount: "477,898,980",
        sender: eric.wallet,
      })
      expect(await contracts.sortedTroves.contains(eric.address)).to.equal(true)
    })

    it("Succeeds when fee is less than max fee percentage", async () => {
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

    it("Borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
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

    it("Creates a new Trove and assigns the correct collateral and debt amount", async () => {
      await updateTroveSnapshot(contracts, carol, "before")

      expect(carol.trove.debt.before).is.equal(0)
      expect(carol.trove.collateral.before).is.equal(0)
      expect(carol.trove.status.before).is.equal(0)

      await openTrove(contracts, {
        musdAmount: MIN_NET_DEBT,
        sender: carol.wallet,
      })

      // Get the expected debt based on the mUSD request (adding fee and liq. reserve on top)
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

    it("Allows a user to open a Trove, then close it, then re-open it", async () => {
      // Send mUSD to Alice so she has sufficent funds to close the trove
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

    it("opens a new Trove with the current interest rate and sets the lastInterestUpdatedTime", async () => {
      await setInterestRate(contracts, council, 100)

      // open a new trove
      await openTrove(contracts, {
        musdAmount: "100,000",
        sender: dennis.wallet,
      })

      // check that the interest rate on the trove is the current interest rate
      const interestRate = await contracts.troveManager.getTroveInterestRate(
        dennis.wallet,
      )
      expect(interestRate).is.equal(100)

      // check that the lastInterestUpdatedTime on the Trove is the current time
      const lastInterestUpdatedTime =
        await contracts.troveManager.getTroveLastInterestUpdateTime(
          dennis.wallet,
        )

      const currentTime = await getLatestBlockTimestamp()

      expect(lastInterestUpdatedTime).is.equal(currentTime)
    })

    it("Increases user mUSD balance by correct amount", async () => {
      expect(await contracts.musd.balanceOf(carol.wallet)).to.equal(0)

      const musdAmount = to1e18("100,000")
      await openTrove(contracts, {
        musdAmount,
        sender: carol.wallet,
      })

      expect(await contracts.musd.balanceOf(carol.wallet)).to.equal(musdAmount)
    })

    it("Increases the Trove's mUSD debt by the correct amount", async () => {
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

    it("Increases mUSD debt in ActivePool by the debt of the trove", async () => {
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

    it("Sets the maximum borrowing capacity on a trove when it is opened", async () => {
      // Open a large trove for Alice with high ICR so we don't go into recovery mode
      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "500",
        sender: eric.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "5,000",
        ICR: "110",
        sender: dennis.wallet,
      })
      await updateTroveSnapshot(contracts, dennis, "before")

      // Dennis borrowed the maximum amount so his debt should equal his borrowing capacity
      expect(dennis.trove.maxBorrowingCapacity.before).is.equal(
        dennis.trove.debt.before,
      )
    })

    it("Sets the maximum borrowing capacity on a trove when it is opened at higher than 110% ICR", async () => {
      // Open a large trove for Alice with high ICR so we don't go into recovery mode
      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "500",
        sender: eric.wallet,
      })

      const { collateral } = await openTrove(contracts, {
        musdAmount: "5,000",
        ICR: "200",
        sender: dennis.wallet,
      })

      const price = await contracts.priceFeed.fetchPrice()

      const expectedBorrowingCapacity =
        (collateral * price * 100n) / to1e18(110)

      await updateTroveSnapshot(contracts, dennis, "before")

      // Dennis borrowed the maximum amount so his debt should equal his borrowing capacity
      expect(dennis.trove.maxBorrowingCapacity.before).is.equal(
        expectedBorrowingCapacity,
      )
    })

    it("Adds the trove's principal to the principal for its interest rate", async () => {
      const principalBefore = (await contracts.troveManager.interestRateData(0))
        .principal

      await openTrove(contracts, {
        musdAmount: "5,000",
        ICR: "400",
        sender: dennis.wallet,
      })

      const principalAfter = (await contracts.troveManager.interestRateData(0))
        .principal

      await updateTroveSnapshot(contracts, dennis, "before")
      expect(principalAfter - principalBefore).to.equal(
        dennis.trove.debt.before,
      )
    })

    it("Borrowing at non-zero base rate sends mUSD fee to PCV contract", async () => {
      state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)

      const newRate = to1e18(5) / 100n
      await setNewRate(newRate)

      await fastForwardTime(7200)

      await openTrove(contracts, {
        musdAmount: "40,000",
        sender: dennis.wallet,
      })

      state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)
      expect(state.pcv.musd.after).is.greaterThan(state.pcv.musd.before)
    })

    it("Borrowing at non-zero base rate sends requested amount to the user", async () => {
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

    it("Borrowing at zero base rate changes the PCV contract mUSD fees collected", async () => {
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

    it("Borrowing at zero base rate charges minimum fee", async () => {
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

    it("Adds Trove owner to TroveOwners array", async () => {
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

    it("Creates a stake and adds it to total stakes", async () => {
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

    it("Inserts Trove to Sorted Troves list", async () => {
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

    it("Increases the activePool collateral and raw collateral balance by correct amount", async () => {
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

    context("Expected Reverts", () => {
      it("Reverts when BorrowerOperations address is not in mintlist", async () => {
        // remove mintlist
        await removeMintlist(contracts, deployer.wallet)
        await expect(
          openTrove(contracts, {
            musdAmount: "100,000",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith("MUSD: Caller not allowed to mint")
      })

      it("Reverts if amount to borrow is zero", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "0",
            sender: carol.wallet,
          }),
        ).to.be.revertedWithPanic()
      })

      it("Reverts if net debt < minimum net debt", async () => {
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

      it("Reverts if max fee > 100%", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: carol.wallet,
            maxFeePercentage: "101",
          }),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("Reverts if max fee < 0.5% in Normal mode", async () => {
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

      it("Reverts if fee exceeds max fee percentage", async () => {
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

      it("Reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
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

      it("Reverts if trove is already active", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: "10,000",
            sender: alice.wallet,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove is active")
      })

      it("Reverts when trove ICR < MCR", async () => {
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

    context("Emitted Events", () => {
      it("Emits a TroveUpdated event with the correct collateral and debt", async () => {
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

      it("Emits a TroveUpdated event with the correct collateral and debt after changed baseRate", async () => {
        const abi = [
          // Add your contract ABI here
          "event TroveUpdated(address indexed borrower, uint256 debt, uint256 coll, uint256 stake, uint8 operation)",
        ]

        // system state change via Tester functionality
        const newRate = to1e18(5) / 100n
        await setNewRate(newRate)

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
  })

  describe("closeTrove", () => {
    it("no mintlist, succeeds when it would lower the TCR below CCR", async () => {
      await openTrove(contracts, {
        musdAmount: "30,000",
        ICR: "300",
        sender: carol.wallet,
      })

      await removeMintlist(contracts, deployer.wallet)

      const price = to1e18("33,500")
      const amount = to1e18("10,000")
      // transfer
      await contracts.musd.connect(bob.wallet).transfer(carol.wallet, amount)
      await contracts.mockAggregator.setPrice(price)

      expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
        false,
      )
      await contracts.borrowerOperations.connect(carol.wallet).closeTrove()
    })

    it("reduces a Trove's collateral to zero", async () => {
      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      await updateTroveSnapshot(contracts, alice, "after")
      expect(alice.trove.collateral.after).to.equal(0)
    })

    it("reduces a Trove's debt to zero", async () => {
      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      await updateTroveSnapshot(contracts, alice, "after")
      expect(alice.trove.debt.after).to.equal(0)
    })

    it("sets Trove's stake to zero", async () => {
      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      await updateTroveSnapshot(contracts, alice, "after")
      expect(alice.trove.stake.after).to.equal(0)
    })

    it("sends the correct amount of collateral to the user", async () => {
      await updateTroveSnapshot(contracts, alice, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.collateral.after).to.equal(
        state.activePool.collateral.before - alice.trove.collateral.before,
      )
    })

    it("subtracts the debt of the closed Trove from the Borrower's mUSD balance", async () => {
      await updateTroveSnapshot(contracts, alice, "before")

      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      alice.musd.before = await contracts.musd.balanceOf(alice.wallet)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
      alice.musd.after = await contracts.musd.balanceOf(alice.wallet)

      expect(alice.musd.after).to.equal(
        alice.musd.before - alice.trove.debt.before + MUSD_GAS_COMPENSATION,
      )
    })

    it("zero's the troves reward snapshots", async () => {
      await setupCarolsTrove()

      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)

      await createLiquidationEvent(contracts)

      // do a transaction that will update Alice's reward snapshot values
      await contracts.borrowerOperations.withdrawMUSD(
        to1e18(1),
        1n,
        alice.wallet,
        alice.wallet,
      )
      await updateRewardSnapshot(contracts, alice, "before")
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
      await updateRewardSnapshot(contracts, alice, "after")

      expect(alice.rewardSnapshot.collateral.before).to.be.greaterThan(0)
      expect(alice.rewardSnapshot.debt.before).to.be.greaterThan(0)
      expect(alice.rewardSnapshot.collateral.after).to.be.equal(0)
      expect(alice.rewardSnapshot.debt.after).to.be.equal(0)
    })

    it("sets trove's status to closed and removes it from sorted troves list", async () => {
      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      await updateTroveSnapshot(contracts, alice, "after")
      expect(alice.trove.status.after).to.equal(2)
      expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
        false,
      )
    })

    it("reduces ActivePool collateral and raw collateral by correct amount", async () => {
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )
      await updateTroveSnapshot(contracts, alice, "before")

      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.collateral.after).to.equal(
        state.activePool.collateral.before - alice.trove.collateral.before,
      )
      expect(state.activePool.btc.after).to.equal(
        state.activePool.btc.before - alice.trove.collateral.before,
      )
    })

    it("reduces ActivePool debt by correct amount", async () => {
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )
      await updateTroveSnapshot(contracts, alice, "before")

      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.after).to.equal(
        state.activePool.debt.before - alice.trove.debt.before,
      )
    })

    it("updates the the total stakes", async () => {
      await updateTroveSnapshot(contracts, alice, "before")
      await updateTroveManagerSnapshot(contracts, state, "before")

      const amount = to1e18("10,000")
      await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)
      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
      await updateTroveManagerSnapshot(contracts, state, "after")

      expect(state.troveManager.stakes.after).to.equal(
        state.troveManager.stakes.before - alice.trove.stake.before,
      )
      expect(alice.trove.stake.before).to.be.greaterThan(0)
    })

    context("Expected Reverts", () => {
      it("reverts when it would lower the TCR below CCR", async () => {
        await openTrove(contracts, {
          musdAmount: "30,000",
          ICR: "300",
          sender: carol.wallet,
        })

        const amount = to1e18("10,000")
        // transfer
        await contracts.musd.connect(bob.wallet).transfer(carol.wallet, amount)

        const price = to1e18("33,500")
        await contracts.mockAggregator.setPrice(price)

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          false,
        )
        await expect(
          contracts.borrowerOperations.connect(carol.wallet).closeTrove(),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in TCR < CCR is not permitted",
        )
      })

      it(" calling address does not have active trove", async () => {
        await expect(
          contracts.borrowerOperations.connect(carol.wallet).closeTrove(),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("reverts when trove is the only one in the system", async () => {
        // Artificially mint to Alice and Bob have enough to close their troves
        await contracts.musd.unprotectedMint(alice.wallet, to1e18("1,000"))
        await contracts.musd.unprotectedMint(bob.wallet, to1e18("1,000"))

        await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
        await expect(
          contracts.borrowerOperations.connect(bob.wallet).closeTrove(),
        ).to.be.revertedWith("TroveManager: Only one trove in the system")
      })

      it("reverts if borrower has insufficient mUSD to repay his entire debt", async () => {
        await expect(
          contracts.borrowerOperations.connect(bob.wallet).closeTrove(),
        ).to.be.revertedWith(
          "BorrowerOps: Caller doesnt have enough mUSD to make repayment",
        )
      })
    })
  })

  describe("addColl()", () => {
    it("active Trove: adds the correct collateral amount to the Trove", async () => {
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

    it("active Trove: Trove is in sortedList before and after", async () => {
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

    it("active Trove: updates the stake and updates the total stakes", async () => {
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

    it("no mintlist, can add collateral", async () => {
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

    it("increases the activePool collateral and raw collateral balance by correct amount", async () => {
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

    it("updates the Trove's interest owed ", async () => {
      await setInterestRate(contracts, council, 100)
      await openTrove(contracts, {
        musdAmount: "50,000",
        sender: carol.wallet,
      })
      await updateTroveSnapshot(contracts, carol, "before")

      await addColl(contracts, {
        amount: to1e18(1),
        sender: carol.wallet,
      })
      await fastForwardTime(60 * 60 * 24 * 7) // fast-forward one week

      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.interestOwed.after).to.be.greaterThan(
        carol.trove.interestOwed.before,
      )
    })

    context("Expected Reverts", () => {
      it("reverts if trove is non-existent or closed", async () => {
        await expect(
          addColl(contracts, {
            amount: to1e18(1),
            sender: carol.wallet,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })
    })
  })

  describe("withdrawColl()", () => {
    it("updates the stake and updates the total stakes", async () => {
      await setupCarolsTrove()
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

    it("leaves the Trove active when the user withdraws less than all the collateral", async () => {
      const withdrawalAmount = 1n
      await setupCarolsTrove()

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet)

      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.status.after).to.equal(1)
      expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(true)
    })

    it("reduces the Trove's collateral by the correct amount", async () => {
      const withdrawalAmount = 1n
      await setupCarolsTrove()

      await updateTroveSnapshot(contracts, carol, "before")
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet)
      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.collateral.after).to.equal(
        carol.trove.collateral.before - withdrawalAmount,
      )
    })

    it("sends the correct amount of collateral to the user", async () => {
      const withdrawalAmount = to1e18("0.5")
      await setupCarolsTrove()

      carol.btc.before = await ethers.provider.getBalance(carol.address)
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet, NO_GAS)
      carol.btc.after = await ethers.provider.getBalance(carol.address)

      expect(carol.btc.after).to.equal(carol.btc.before + withdrawalAmount)
    })

    it("reduces ActivePool collateral and raw collateral by correct amount", async () => {
      const withdrawalAmount = to1e18("0.5")
      await setupCarolsTrove()

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

    it("applies pending rewards and updates user's L_Collateral, L_MUSDDebt snapshots", async () => {
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
      await contracts.mockAggregator.setPrice(price)

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
        .withdrawColl(withdrawalAmount, carol.wallet, carol.wallet, NO_GAS)
      await contracts.borrowerOperations
        .connect(dennis.wallet)
        .withdrawColl(withdrawalAmount, dennis.wallet, dennis.wallet, NO_GAS)

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

    context("Expected Reverts", () => {
      it("reverts when withdrawal would leave trove with ICR < MCR", async () => {
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

      it("no mintlist, reverts when withdrawal would leave trove with ICR < MCR", async () => {
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

      it("reverts when calling address does not have active trove", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .withdrawColl(1n, carol.wallet, carol.wallet),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("reverts when requested collateral withdrawal is > the trove's collateral", async () => {
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
  })

  describe("withdrawMUSD()", () => {
    it("decays a non-zero base rate", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      const newRate = to1e18(5) / 100n
      await setupCarolsTroveAndAdjustRate()

      await fastForwardTime(7200)
      // first withdrawal
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet)

      const baseRate2 = await contracts.troveManager.baseRate()
      expect(newRate).is.greaterThan(baseRate2)

      await fastForwardTime(3600)
      // second withdrawal
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet)

      const baseRate3 = await contracts.troveManager.baseRate()
      expect(baseRate2).is.greaterThan(baseRate3)
    })

    it("doesn't change base rate if it is already zero", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      await setupCarolsTrove()

      // first withdrawal
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet)

      expect(await contracts.troveManager.baseRate()).is.equal(0n)

      await fastForwardTime(3600)

      // second withdrawal
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet)

      expect(await contracts.troveManager.baseRate()).is.equal(0n)
    })

    it("lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      await setupCarolsTrove()

      // Artificially make baseRate 5%
      const newRate = to1e18(5) / 100n
      await setNewRate(newRate)

      const lastFeeOpTime1 = await contracts.troveManager.lastFeeOperationTime()
      await fastForwardTime(10)

      // trigger a fee
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet)

      await expect(lastFeeOpTime1).to.equal(
        await contracts.troveManager.lastFeeOperationTime(),
      )
      await fastForwardTime(60)

      // trigger second fee
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet)

      expect(lastFeeOpTime1).to.be.lessThan(
        await contracts.troveManager.lastFeeOperationTime(),
      )
    })

    it("borrowing at zero base rate changes mUSD fees", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      await setupCarolsTrove()

      state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet)
      state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)

      expect(state.pcv.musd.after).is.greaterThan(state.pcv.musd.before)
    })

    it("increases the Trove's mUSD debt by the correct amount", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      const borrowingRate = await contracts.troveManager.getBorrowingRate()
      await setupCarolsTrove()

      await updateTroveSnapshot(contracts, carol, "before")
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)
      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.debt.after).to.equal(
        carol.trove.debt.before +
          (amount * (to1e18(1) + borrowingRate)) / to1e18(1),
      )
    })

    it("borrowing at zero base rate sends debt request to user", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      await setupCarolsTrove()

      // Check baseRate is zero
      expect(await contracts.troveManager.baseRate()).to.equal(0)

      await fastForwardTime(7200)

      carol.musd.before = await contracts.musd.balanceOf(carol.wallet)
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)
      carol.musd.after = await contracts.musd.balanceOf(carol.wallet)

      expect(carol.musd.after).to.equal(carol.musd.before + amount)
    })

    it("withdrawMUSD(): borrowing at non-zero base rate sends requested amount to the user", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      await setupCarolsTroveAndAdjustRate()

      carol.musd.before = await contracts.musd.balanceOf(carol.wallet)
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)
      carol.musd.after = await contracts.musd.balanceOf(carol.wallet)

      expect(carol.musd.after).to.equal(carol.musd.before + amount)
    })

    it("withdrawMUSD(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)

      await openTrove(contracts, {
        musdAmount: "20,000",
        ICR: "500",
        sender: carol.wallet,
      })

      const newRate = to1e18(5) / 100n
      await setNewRate(newRate)

      // 30 seconds
      fastForwardTime(30)

      // Borrower triggers a fee, before 60 minute decay interval has passed
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)

      // 1 minute pass
      fastForwardTime(60)

      // Borrower triggers another fee
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)

      // Check base rate has decreased even though Borrower tried to stop it decaying
      expect(await contracts.troveManager.baseRate()).is.lessThan(newRate)
    })

    it("borrowing at non-zero base rate sends mUSD fee to PCV contract", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      await setupCarolsTroveAndAdjustRate()

      state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)
      state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)
      expect(state.pcv.musd.after).to.greaterThan(state.pcv.musd.before)
    })

    it("borrowing at non-zero base records the (drawn debt + fee) on the Trove struct", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      const abi = [
        // Add your contract ABI here
        "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
      ]
      await setupCarolsTroveAndAdjustRate()

      await updateTroveSnapshot(contracts, carol, "before")
      const tx = await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)

      const emittedFee = await getEventArgByName(
        tx,
        abi,
        "MUSDBorrowingFeePaid",
        1,
      )
      expect(emittedFee).to.greaterThan(0)

      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.debt.after).to.equal(
        carol.trove.debt.before + emittedFee + amount,
      )
    })

    it("increases mUSD debt in ActivePool by correct amount", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)

      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      const expectedDebt =
        amount + (await contracts.troveManager.getBorrowingFee(amount))

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet)

      await updateTroveSnapshot(contracts, carol, "after")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.after).to.equal(
        state.activePool.debt.before + expectedDebt,
      )

      expect(state.activePool.debt.after).to.equal(
        state.activePool.debt.before +
          carol.trove.debt.after -
          carol.trove.debt.before,
      )
    })

    context("Expected Reverts", () => {
      it("reverts if BorrowerOperations removed from mintlist", async () => {
        await removeMintlist(contracts, deployer.wallet)
        await expect(
          contracts.borrowerOperations.withdrawMUSD(
            to1e18(1),
            1n,
            alice.wallet,
            alice.wallet,
          ),
        ).to.be.revertedWith("MUSD: Caller not allowed to mint")
      })

      it("reverts when withdrawal would leave trove with ICR < MCR", async () => {
        await setupCarolsTrove() // add extra trove so we can drop Bob's c-ratio below the MCR without putting the system into recovery mode

        // Price drops 50,000 --> 30,000
        const price = to1e18("30,000")
        await contracts.mockAggregator.setPrice(price)

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          false,
        )

        const maxFeePercentage = to1e18(1)
        const amount = 1n

        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("reverts if max fee > 100%", async () => {
        const maxFeePercentage = to1e18(1) + 1n
        const amount = 1n
        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("reverts if max fee < 0.5% in Normal mode", async () => {
        const maxFeePercentage = to1e18(0.005) - 1n
        const amount = 1n
        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("reverts if fee exceeds max fee percentage", async () => {
        const newRate = to1e18(5) / 100n
        await setupCarolsTroveAndAdjustRate()

        // Set max fee percentage to 4.999999999999999999
        const maxFeePercentage = newRate - 1n
        const amount = to1e18(1)
        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet),
        ).to.be.revertedWith("Fee exceeded provided maximum")
      })

      it("reverts when calling address does not have active trove", async () => {
        const maxFeePercentage = to1e18(1)
        const amount = to1e18(1)

        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .withdrawMUSD(maxFeePercentage, amount, carol.wallet, carol.wallet),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("reverts when requested withdrawal amount is zero mUSD", async () => {
        const maxFeePercentage = to1e18(1)
        const amount = 0

        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .withdrawMUSD(maxFeePercentage, amount, alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: Debt increase requires non-zero debtChange",
        )
      })

      it("reverts when a withdrawal would cause the TCR of the system to fall below the CCR", async () => {
        const price = await contracts.priceFeed.fetchPrice()
        const tcr = await contracts.troveManager.getTCR(price)

        expect(tcr).to.equal(to1e18(1.5))

        // Bob attempts to withdraw 1 mUSD.
        const maxFeePercentage = to1e18(1)
        const amount = to1e18(1)

        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .withdrawMUSD(maxFeePercentage, amount, alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in TCR < CCR is not permitted",
        )
      })
    })
  })

  describe("repayMUSD()", () => {
    it("succeeds when it would leave trove with net debt >= minimum net debt", async () => {
      const amount = to1e18("1,000")
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .repayMUSD(amount, bob.wallet, bob.wallet)
      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.debt.after).is.greaterThan(MIN_NET_DEBT)
    })

    it("reduces the Trove's mUSD debt by the correct amount", async () => {
      const amount = to1e18("1,000")
      await updateTroveSnapshot(contracts, bob, "before")
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .repayMUSD(amount, bob.wallet, bob.wallet)
      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.debt.after).to.equal(bob.trove.debt.before - amount)
    })

    it("decreases user mUSD balance by correct amount", async () => {
      bob.musd.before = await contracts.musd.balanceOf(bob.address)
      const amount = to1e18("1,000")
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .repayMUSD(amount, bob.wallet, bob.wallet)
      bob.musd.after = await contracts.musd.balanceOf(bob.address)

      expect(bob.musd.after).to.equal(bob.musd.before - amount)
    })

    it("decreases mUSD debt in ActivePool by correct amount", async () => {
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      const amount = to1e18("1,000")
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .repayMUSD(amount, bob.wallet, bob.wallet)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.after).to.equal(
        state.activePool.debt.before - amount,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when repayment would leave trove with ICR < MCR", async () => {
        await setupCarolsTrove()

        const price = to1e18("30,000")
        await contracts.mockAggregator.setPrice(price)

        expect(
          await contracts.troveManager.getCurrentICR(alice.wallet, price),
        ).is.lessThan(to1e18("1.1"))
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .repayMUSD(to1e18(1), alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("repayMUSD(): no mintlist, reverts when repayment would leave trove with ICR < MCR", async () => {
        await setupCarolsTrove()
        await removeMintlist(contracts, deployer.wallet)

        const price = to1e18("30,000")
        await contracts.mockAggregator.setPrice(price)

        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .repayMUSD(to1e18(1), alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("reverts when it would leave trove with net debt < minimum net debt", async () => {
        await setupCarolsTrove()
        const amount = to1e18("9,999")

        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .repayMUSD(amount, alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: Trove's net debt must be greater than minimum",
        )
      })

      it("reverts when calling address does not have active trove", async () => {
        const amount = to1e18(1)
        await expect(
          contracts.borrowerOperations
            .connect(dennis.wallet)
            .repayMUSD(amount, dennis.wallet, dennis.wallet),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("reverts when attempted repayment is > the debt of the trove", async () => {
        await updateTroveSnapshot(contracts, alice, "before")
        const amount = alice.trove.debt.before + 1n
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .repayMUSD(amount, alice.wallet, alice.wallet),
        ).to.be.revertedWithPanic()
      })

      it("Reverts if borrower has insufficient mUSD to cover his debt repayment", async () => {
        // bob has $20,000 of MUSD. Transfer $15,000 to Alice before trying to repay $15,000
        const amount = to1e18("15,000")
        await contracts.musd.connect(bob.wallet).transfer(alice.wallet, amount)

        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .repayMUSD(amount, bob.wallet, bob.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: Caller doesnt have enough mUSD to make repayment",
        )
      })
    })
  })

  describe("adjustTrove()", () => {
    it("decays a non-zero base rate", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)
      const newRate = to1e18(5) / 100n
      await setupCarolsTroveAndAdjustRate()
      await fastForwardTime(7200)

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          amount,
          true,
          0,
          bob.wallet,
          bob.wallet,
        )

      const baseRate2 = await contracts.troveManager.baseRate()
      expect(newRate).is.greaterThan(baseRate2)

      await fastForwardTime(3600)
      // second withdrawal
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(to1e18(1), 0, to1e18(37), true, 0, bob.wallet, bob.wallet)

      const baseRate3 = await contracts.troveManager.baseRate()
      expect(baseRate2).is.greaterThan(baseRate3)
    })

    it("doesn't decay a non-zero base rate when user issues 0 debt", async () => {
      const maxFeePercentage = to1e18(1)
      const assetAmount = to1e18(1)

      await setupCarolsTroveAndAdjustRate()
      await fastForwardTime(7200)
      await updateTroveManagerSnapshot(contracts, state, "before")

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          0,
          false,
          assetAmount,
          bob.wallet,
          bob.wallet,
          {
            value: assetAmount,
          },
        )

      await updateTroveManagerSnapshot(contracts, state, "after")
      // Check baseRate has not decreased
      expect(state.troveManager.baseRate.after).is.equal(
        state.troveManager.baseRate.before,
      )
    })

    it("doesn't change base rate if it is already zero", async () => {
      const maxFeePercentage = to1e18(1)

      await setupCarolsTrove()
      await fastForwardTime(7200)
      await updateTroveManagerSnapshot(contracts, state, "before")

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          to1e18(37),
          true,
          0,
          bob.wallet,
          bob.wallet,
        )

      await updateTroveManagerSnapshot(contracts, state, "after")
      // Check baseRate has not decreased
      expect(state.troveManager.baseRate.after).is.equal(
        state.troveManager.baseRate.before,
      )
      expect(state.troveManager.baseRate.after).is.equal(0)
    })

    it("lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
      const maxFeePercentage = to1e18(1)

      await setupCarolsTroveAndAdjustRate()
      await contracts.troveManager.setLastFeeOpTimeToNow()
      await updateTroveManagerSnapshot(contracts, state, "before")

      await fastForwardTime(10)

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          to1e18(37),
          true,
          0,
          bob.wallet,
          bob.wallet,
        )

      await updateTroveManagerSnapshot(contracts, state, "after")

      expect(state.troveManager.lastFeeOperationTime.before).is.equal(
        state.troveManager.lastFeeOperationTime.after,
      )
      expect(state.troveManager.lastFeeOperationTime.before).is.greaterThan(0)
    })

    it("borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
      const maxFeePercentage = to1e18(1)

      await setupCarolsTroveAndAdjustRate()
      await updateTroveManagerSnapshot(contracts, state, "before")

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          to1e18(37),
          true,
          0,
          bob.wallet,
          bob.wallet,
        )

      await fastForwardTime(60)

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          to1e18(37),
          true,
          0,
          bob.wallet,
          bob.wallet,
        )
      await updateTroveManagerSnapshot(contracts, state, "after")
      expect(state.troveManager.baseRate.before).to.be.greaterThan(
        state.troveManager.baseRate.after,
      )
    })

    it("borrowing at non-zero base records the (drawn debt + fee) on the Trove struct", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(37)
      const abi = [
        // Add your contract ABI here
        "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
      ]

      await setupCarolsTroveAndAdjustRate()

      await updateTroveSnapshot(contracts, bob, "before")
      await fastForwardTime(60)

      const tx = await contracts.borrowerOperations
        .connect(bob.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          amount,
          true,
          0,
          bob.wallet,
          bob.wallet,
        )

      const emittedFee = await getEventArgByName(
        tx,
        abi,
        "MUSDBorrowingFeePaid",
        1,
      )

      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.debt.after).to.equal(
        bob.trove.debt.before + amount + emittedFee,
      )
    })

    it("Borrowing at non-zero base rate sends requested amount to the user", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(37)

      await setupCarolsTroveAndAdjustRate()
      await updateWalletSnapshot(contracts, carol, "before")
      await fastForwardTime(7200)

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          amount,
          true,
          0,
          carol.wallet,
          carol.wallet,
        )

      await updateWalletSnapshot(contracts, carol, "after")
      expect(carol.musd.after).to.equal(carol.musd.before + amount)
    })

    it("Borrowing at zero base rate sends total requested mUSD to the user", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(37)

      await setupCarolsTrove()
      await updateWalletSnapshot(contracts, carol, "before")
      await fastForwardTime(7200)

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          amount,
          true,
          0,
          carol.wallet,
          carol.wallet,
        )

      await updateWalletSnapshot(contracts, carol, "after")
      expect(carol.musd.after).to.equal(carol.musd.before + amount)
    })

    it("Borrowing at zero base rate changes mUSD balance of PCV contract", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(37)

      state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)

      await setupCarolsTrove()
      await fastForwardTime(7200)
      expect(await contracts.troveManager.baseRate()).is.equal(0)

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          amount,
          true,
          0,
          carol.wallet,
          carol.wallet,
        )

      state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)
      expect(state.pcv.musd.after).to.be.greaterThan(state.pcv.musd.before)
    })

    it("borrowing at non-zero base rate sends mUSD fee to PCV contract", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(37)

      state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)

      await setupCarolsTroveAndAdjustRate()
      await fastForwardTime(7200)

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          amount,
          true,
          0,
          carol.wallet,
          carol.wallet,
        )

      state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)
      expect(state.pcv.musd.after).to.be.greaterThan(state.pcv.musd.before)
    })

    it("With 0 coll change, doesnt change borrower's coll or ActivePool coll", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(37)

      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          amount,
          true,
          0,
          carol.wallet,
          carol.wallet,
        )

      await updateTroveSnapshot(contracts, carol, "after")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(carol.trove.collateral.after).to.be.equal(
        carol.trove.collateral.before,
      )
      expect(state.activePool.collateral.after).to.be.equal(
        state.activePool.collateral.before,
      )
    })

    it("With 0 debt change, doesnt change borrower's debt or ActivePool debt", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)

      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          0,
          false,
          amount,
          carol.wallet,
          carol.wallet,
          {
            value: amount,
          },
        )

      await updateTroveSnapshot(contracts, carol, "after")
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(carol.trove.debt.after).to.be.equal(carol.trove.debt.before)
      expect(state.activePool.debt.after).to.be.equal(
        state.activePool.debt.before,
      )
    })

    it("updates borrower's debt and coll with an increase in both", async () => {
      const abi = [
        // Add your contract ABI here
        "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
      ]

      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")

      const tx = await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          true,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )

      const emittedFee = await getEventArgByName(
        tx,
        abi,
        "MUSDBorrowingFeePaid",
        1,
      )
      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.collateral.after).to.be.equal(
        carol.trove.collateral.before + collChange,
      )
      expect(carol.trove.debt.after).to.be.equal(
        carol.trove.debt.before + debtChange + emittedFee,
      )
    })

    it("updates borrower's debt and coll with a decrease in both", async () => {
      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          collChange,
          debtChange,
          false,
          0,
          carol.wallet,
          carol.wallet,
        )

      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.collateral.after).to.be.equal(
        carol.trove.collateral.before - collChange,
      )
      expect(carol.trove.debt.after).to.be.equal(
        carol.trove.debt.before - debtChange,
      )
    })

    it("updates borrower's debt and coll with coll increase, debt decrease", async () => {
      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          false,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )

      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.collateral.after).to.be.equal(
        carol.trove.collateral.before + collChange,
      )
      expect(carol.trove.debt.after).to.be.equal(
        carol.trove.debt.before - debtChange,
      )
    })

    it("updates borrower's debt and coll with coll decrease, debt increase", async () => {
      const abi = [
        // Add your contract ABI here
        "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
      ]

      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")

      const tx = await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          collChange,
          debtChange,
          true,
          0,
          carol.wallet,
          carol.wallet,
        )

      const emittedFee = await getEventArgByName(
        tx,
        abi,
        "MUSDBorrowingFeePaid",
        1,
      )
      await updateTroveSnapshot(contracts, carol, "after")

      expect(carol.trove.collateral.after).to.be.equal(
        carol.trove.collateral.before - collChange,
      )
      expect(carol.trove.debt.after).to.be.equal(
        carol.trove.debt.before + debtChange + emittedFee,
      )
    })

    it("updates borrower's stake and totalStakes with a coll increase", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)

      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")
      await updateTroveManagerSnapshot(contracts, state, "before")

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          0,
          false,
          amount,
          carol.wallet,
          carol.wallet,
          {
            value: amount,
          },
        )

      await updateTroveSnapshot(contracts, carol, "after")
      await updateTroveManagerSnapshot(contracts, state, "after")

      expect(carol.trove.stake.after).to.be.equal(
        carol.trove.stake.before + amount,
      )
      expect(state.troveManager.stakes.after).to.be.equal(
        state.troveManager.stakes.before + amount,
      )
    })

    it("updates borrower's stake and totalStakes with a coll decrease", async () => {
      const maxFeePercentage = to1e18(1)
      const amount = to1e18(1)

      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")
      await updateTroveManagerSnapshot(contracts, state, "before")

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          amount,
          0,
          false,
          0,
          carol.wallet,
          carol.wallet,
        )

      await updateTroveSnapshot(contracts, carol, "after")
      await updateTroveManagerSnapshot(contracts, state, "after")

      expect(carol.trove.stake.after).to.be.equal(
        carol.trove.stake.before - amount,
      )
      expect(state.troveManager.stakes.after).to.be.equal(
        state.troveManager.stakes.before - amount,
      )
    })

    it("changes mUSD balance by the requested decrease", async () => {
      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateWalletSnapshot(contracts, carol, "before")

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          collChange,
          debtChange,
          false,
          0,
          carol.wallet,
          carol.wallet,
        )

      await updateWalletSnapshot(contracts, carol, "after")
      expect(carol.musd.after).to.be.equal(carol.musd.before - debtChange)
    })

    it("changes mUSD balance by the requested increase", async () => {
      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateWalletSnapshot(contracts, carol, "before")

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          true,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )

      await updateWalletSnapshot(contracts, carol, "after")
      expect(carol.musd.after).to.be.equal(carol.musd.before + debtChange)
    })

    it("Changes the activePool collateral and raw collateral balance by the requested decrease", async () => {
      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          collChange,
          debtChange,
          false,
          0,
          carol.wallet,
          carol.wallet,
        )
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.btc.after).to.be.equal(
        state.activePool.btc.before - collChange,
      )
      expect(state.activePool.collateral.after).to.be.equal(
        state.activePool.collateral.before - collChange,
      )
    })

    it("Changes the activePool collateral and raw collateral balance by the amount of collateral sent", async () => {
      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          false,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.btc.after).to.be.equal(
        state.activePool.btc.before + collChange,
      )
      expect(state.activePool.collateral.after).to.be.equal(
        state.activePool.collateral.before + collChange,
      )
    })

    it("Changes the mUSD debt in ActivePool by requested decrease", async () => {
      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          false,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.after).to.be.equal(
        state.activePool.debt.before - debtChange,
      )
    })

    it("Changes the mUSD debt in ActivePool by requested increase", async () => {
      const abi = [
        // Add your contract ABI here
        "event MUSDBorrowingFeePaid(address indexed _borrower, uint256 _MUSDFee)",
      ]

      const maxFeePercentage = to1e18(1)
      const debtChange = to1e18(50)
      const collChange = to1e18(1)
      await setupCarolsTrove()
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      const tx = await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          true,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )

      const emittedFee = await getEventArgByName(
        tx,
        abi,
        "MUSDBorrowingFeePaid",
        1,
      )
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.after).to.be.equal(
        state.activePool.debt.before + debtChange + emittedFee,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when adjustment would leave trove with ICR < MCR", async () => {
        await setupCarolsTrove()

        // Price drops
        const price = to1e18("30,000")
        await contracts.mockAggregator.setPrice(price)

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          false,
        )

        await updateTroveSnapshot(contracts, alice, "before")
        expect(alice.trove.icr.before).to.be.lessThan(to1e18(1.1))

        const debtChange = 1n
        const collateralTopUp = 1n

        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              0,
              debtChange,
              false,
              collateralTopUp,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("no mintlist, reverts when adjustment would leave trove with ICR < MCR", async () => {
        await setupCarolsTrove()
        await removeMintlist(contracts, deployer.wallet)

        // Price drops
        const price = to1e18("30,000")
        await contracts.mockAggregator.setPrice(price)

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          false,
        )

        await updateTroveSnapshot(contracts, alice, "before")
        expect(alice.trove.icr.before).to.be.lessThan(to1e18(1.1))

        const debtChange = 1n
        const collateralTopUp = 1n

        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              0,
              debtChange,
              false,
              collateralTopUp,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("reverts if max fee < 0.5% in Normal mode", async () => {
        const collateralTopUp = to1e18(0.02)
        const debtChange = to1e18(1)

        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              0,
              0,
              debtChange,
              true,
              collateralTopUp,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              1n,
              0,
              debtChange,
              true,
              collateralTopUp,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              4999999999999999n,
              0,
              debtChange,
              true,
              collateralTopUp,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
      })

      it("reverts when calling address has no active trove", async () => {
        const collateralTopUp = to1e18(1)
        const debtChange = to1e18(50)

        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .adjustTrove(
              to1e18(1),
              0,
              debtChange,
              true,
              collateralTopUp,
              carol.wallet,
              carol.wallet,
            ),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("reverts when change would cause the TCR of the system to fall below the CCR", async () => {
        const debtChange = to1e18(50)
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              0,
              debtChange,
              true,
              0,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in TCR < CCR is not permitted",
        )
      })

      it("reverts when mUSD repaid is > debt of the trove", async () => {
        // Alice transfers MUSD to bob to compensate borrowing fees
        await contracts.musd
          .connect(alice.wallet)
          .transfer(bob.wallet, to1e18("2,000"))

        await updateTroveSnapshot(contracts, bob, "before")
        const remainingDebt = bob.trove.debt.before - MUSD_GAS_COMPENSATION
        const assetAmount = to1e18(1)
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              0,
              remainingDebt + 1n,
              false,
              assetAmount,
              alice.wallet,
              alice.wallet,
              {
                value: assetAmount,
              },
            ),
        ).to.be.revertedWithPanic()
      })

      it("adjustTrove(): reverts when attempted collateral withdrawal is >= the trove's collateral", async () => {
        await setupCarolsTrove()
        await updateTroveSnapshot(contracts, alice, "before")

        // Alice attempts an adjustment that would withdraw 1 wei more than her collateral
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              alice.trove.collateral.before + 1n,
              0,
              true,
              0,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Debt increase requires non-zero debtChange",
        )
      })

      it("reverts when change would cause the ICR of the trove to fall below the MCR", async () => {
        await setupCarolsTrove()

        // Price drops
        const price = to1e18("40,000")
        await contracts.mockAggregator.setPrice(price)

        const debtChange = to1e18("10,000")
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              0,
              debtChange,
              true,
              0,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("adjustTrove(): new coll = 0 and new debt = 0 is not allowed, as gas compensation still counts toward ICR", async () => {
        await updateTroveSnapshot(contracts, alice, "before")
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              alice.trove.collateral.before,
              alice.trove.debt.before,
              true,
              0,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("Reverts if requested debt increase and amount is zero", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(to1e18(1), 0, 0, true, 0, alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: Debt increase requires non-zero debtChange",
        )
      })

      it("Reverts if requested coll withdrawal and collateral is sent", async () => {
        const assetAmount = to1e18(3)
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              to1e18(1),
              to1e18(1),
              true,
              assetAmount,
              alice.wallet,
              alice.wallet,
              {
                value: assetAmount,
              },
            ),
        ).to.be.revertedWith("BorrowerOperations: Cannot withdraw and add coll")
      })

      it("Reverts if it’s zero adjustment", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(to1e18(1), 0, 0, false, 0, alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: There must be either a collateral change or a debt change",
        )
      })

      it("Reverts if borrower has insufficient mUSD to cover his debt repayment", async () => {
        await updateTroveSnapshot(contracts, alice, "before")
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              to1e18(1),
              0,
              alice.trove.debt.before,
              false,
              0,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWithPanic() // caused by netDebtChange being greater than the debt requiring a negative number going into a uint256
      })
    })
  })
})
