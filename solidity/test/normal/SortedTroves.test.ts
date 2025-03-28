import { expect } from "chai"
import {
  Contracts,
  User,
  dropPriceAndLiquidate,
  fastForwardTime,
  isSortedTrovesSorted,
  openTrove,
  openTroves,
  setInterestRate,
  setupTests,
  updateTroveSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"
import { MAX_BYTES_32, ZERO_ADDRESS } from "../../helpers/constants"

describe("SortedTroves", () => {
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let deployer: User
  let eric: User
  let frank: User
  let treasury: User
  let whale: User
  let council: User
  let contracts: Contracts

  beforeEach(async () => {
    ;({
      alice,
      bob,
      carol,
      council,
      dennis,
      deployer,
      eric,
      frank,
      treasury,
      whale,
      contracts,
    } = await setupTests())

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()
  })

  describe("contains()", () => {
    it("returns true for addresses that have opened troves", async () => {
      const users = [alice, bob]
      await openTroves(contracts, users, "2,000", "200")

      expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(true)
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(true)
    })

    it("returns false for addresses that have not opened troves", async () => {
      await openTrove(contracts, {
        musdAmount: "3,000",
        sender: whale.wallet,
      })

      expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
        false,
      )
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(false)
    })

    it("returns false for addresses that opened and then closed a trove", async () => {
      // Need to open two troves so that we can close Alice's. We can't close the last trove.
      await openTroves(contracts, [alice, bob], "2,000", "200")

      // Give Alice extra mUSD to pay back fees.
      await contracts.musd.unprotectedMint(alice.wallet, to1e18("1,000"))

      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
        false,
      )
    })

    it("returns true for addresses that opened, closed and then re-opened a trove", async () => {
      // Need to open two troves so that we can close Alice's. We can't close the last trove.
      await openTroves(contracts, [alice, bob], "2,000", "200")

      // Give Alice extra mUSD to pay back fees.
      await contracts.musd.unprotectedMint(alice.wallet, to1e18("1,000"))

      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

      await openTrove(contracts, {
        musdAmount: "2,000",
        sender: alice.wallet,
      })

      expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(true)
    })

    it("returns false when there are no troves in the system", async () => {
      expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
        false,
      )
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(false)
      expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
        false,
      )
    })

    it("true when list size is 1 and the trove is the only one in system", async () => {
      await openTrove(contracts, {
        musdAmount: "3,000",
        sender: whale.wallet,
      })

      expect(await contracts.sortedTroves.contains(whale.wallet)).to.equal(true)
    })
  })

  describe("getMaxSize()", () => {
    it("Returns the maximum list size", async () => {
      expect(await contracts.sortedTroves.getMaxSize()).to.equal(MAX_BYTES_32)
    })
  })

  describe("findInsertPosition()", () => {
    it("Finds the correct insert position given two addresses that loosely bound the correct position", async () => {
      // Use 1 BTC = $100 to make the math easy.
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice(to1e18(100))

      const troveData: { user: User; icr: string }[] = [
        {
          user: whale,
          icr: "500",
        },
        {
          user: alice,
          icr: "450",
        },
        {
          user: bob,
          icr: "400",
        },
        {
          user: carol,
          icr: "350",
        },
        {
          user: dennis,
          icr: "300",
        },
        {
          user: eric,
          icr: "250",
        },
      ]

      await Promise.all(
        troveData.map(({ user, icr }) =>
          openTrove(contracts, {
            musdAmount: "3,000",
            ICR: icr,
            sender: user.wallet,
          }),
        ),
      )

      // 375%; should go between Bob and Carol
      const targetNICR = to1e18(3.75)

      // Pass addresses that loosely bound the right postiion
      const [low, high] = await contracts.sortedTroves.findInsertPosition(
        targetNICR,
        alice.wallet,
        eric.wallet,
      )

      expect(low).to.equal(bob.wallet)
      expect(high).to.equal(carol.wallet)
    })
  })

  describe("reInsert()", () => {
    it("reinserts troves based only on collateral and principal", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "300",
        sender: alice.wallet,
      })
      await setInterestRate(contracts, council, 5000)
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "310",
        sender: bob.wallet,
      })

      await setInterestRate(contracts, council, 8000)
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "320",
        sender: carol.wallet,
      })

      await fastForwardTime(365 * 24 * 60 * 60) // one year

      await contracts.borrowerOperations
        .connect(alice.wallet)
        .repayMUSD(1n, ZERO_ADDRESS, ZERO_ADDRESS)

      await contracts.borrowerOperations
        .connect(bob.wallet)
        .repayMUSD(1n, ZERO_ADDRESS, ZERO_ADDRESS)

      await contracts.borrowerOperations
        .connect(carol.wallet)
        .repayMUSD(1n, ZERO_ADDRESS, ZERO_ADDRESS)

      const lowest = await contracts.sortedTroves.getLast()
      const middle = await contracts.sortedTroves.getPrev(lowest)
      const highest = await contracts.sortedTroves.getPrev(middle)

      expect(lowest).to.equal(alice.address)
      expect(middle).to.equal(bob.address)
      expect(highest).to.equal(carol.address)
    })
  })

  describe("Maintains Sortedness", () => {
    it("sorts one trove", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "300",
        sender: alice.wallet,
      })

      expect(await isSortedTrovesSorted(contracts)).to.equal(true)
    })

    it("sorts two troves", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "300",
        sender: alice.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "305",
        sender: bob.wallet,
      })

      expect(await isSortedTrovesSorted(contracts)).to.equal(true)
    })

    it("sorts three troves", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "300",
        sender: alice.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "305",
        sender: bob.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "302",
        sender: carol.wallet,
      })

      expect(await isSortedTrovesSorted(contracts)).to.equal(true)
    })

    // Here, Alice and Bob get set up with different principals but the same
    // NICR. Then, carol opens a trove and gets liquidated, redistributing
    // (different amounts of) debt to alice and bob.
    //
    // Then, dennis opens a new trove with exactly the same NICR as alice and
    // bob (but with no pending rewards). Carol opens another trove and gets
    // liquidated again, and we verify that the troves are all still properly
    // sorted.
    it("when redistributing debt", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "300",
        sender: alice.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "250,000",
        ICR: "300",
        sender: bob.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "111",
        sender: carol.wallet,
      })

      await dropPriceAndLiquidate(contracts, deployer, carol)

      const aliceNICR = await contracts.troveManager.getNominalICR(alice.wallet)

      // Calculate a collateral amount that will give a trove the same NICR as
      // alice and bob.
      //
      // debt = amount + amount * 5 / 1000 + 200e18
      // coll * 1e20 / debt = NICR
      // coll * 1e20 / (amount + amount * 5 / 1000 + 200e18) = NICR
      // coll = NICR * (amount + amount * 5 / 1000 + 200e18) / 1e20
      const amount = to1e18("100,000")
      const collateral =
        (aliceNICR * (amount + (amount * 5n) / 1000n + to1e18(200))) /
        to1e18(100)

      await contracts.borrowerOperations
        .connect(dennis.wallet)
        .openTrove(amount, ZERO_ADDRESS, ZERO_ADDRESS, { value: collateral })

      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "111",
        sender: carol.wallet,
      })

      await dropPriceAndLiquidate(contracts, deployer, carol)

      expect(await isSortedTrovesSorted(contracts)).to.equal(true)
    })

    it("when passed malicious hints in a full+partial redemption", async () => {
      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "350",
        sender: alice.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "340",
        sender: bob.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "330",
        sender: carol.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "320",
        sender: dennis.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "320",
        sender: eric.wallet,
      })

      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "110",
        sender: frank.wallet,
      })

      // Put Frank in a state where he isn't redeemable
      await contracts.mockAggregator
        .connect(deployer.wallet)
        .setPrice((await contracts.priceFeed.fetchPrice()) / 2n)

      await updateTroveSnapshot(contracts, eric, "before")

      // We want to trigger a partial redemption from dennis, so we redeem enough to fully redeem eric, but not dennis

      const redemptionAmount = eric.trove.debt.before + to1e18("30,000")

      const { firstRedemptionHint, partialRedemptionHintNICR } =
        await contracts.hintHelpers.getRedemptionHints(
          redemptionAmount,
          await contracts.priceFeed.fetchPrice(),
          0,
        )

      // Give alice enough mUSD to redeem
      await contracts.musd.unprotectedMint(alice.wallet, redemptionAmount)

      // pass in malicious hints; we *should* be inserting between carol and
      // frank, not eric and frank.
      await contracts.troveManager.redeemCollateral(
        redemptionAmount,
        firstRedemptionHint,
        eric.wallet,
        frank.wallet,
        partialRedemptionHintNICR,
        0,
      )

      expect(await isSortedTrovesSorted(contracts)).to.equal(true)
    })
  })
})
