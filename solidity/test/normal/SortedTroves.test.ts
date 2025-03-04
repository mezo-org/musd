import { expect } from "chai"
import {
  Contracts,
  User,
  fastForwardTime,
  openTrove,
  openTroves,
  setInterestRate,
  setupTests,
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
})
