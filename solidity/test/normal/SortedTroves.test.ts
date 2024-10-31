import { expect } from "chai"
import { Contracts, User, openTrove, openTroves, setupTests } from "../helpers"
import { to1e18 } from "../utils"

describe("SortedTroves", () => {
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let whale: User
  let contracts: Contracts

  beforeEach(async () => {
    ;({ alice, bob, carol, dennis, eric, whale, contracts } =
      await setupTests())
  })

  describe("contains()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {})

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
      it("contains(): returns true for addresses that have opened troves", async () => {
        const users = [alice, bob]
        await openTroves(contracts, users, "2,000", "200")

        expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
          true,
        )
        expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(true)
      })

      it("contains(): returns false for addresses that have not opened troves", async () => {
        await openTrove(contracts, {
          musdAmount: "3,000",
          sender: whale.wallet,
        })

        expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
          false,
        )
        expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(
          false,
        )
      })

      it("contains(): returns false for addresses that opened and then closed a trove", async () => {
        // Need to open two troves so that we can close Alice's. We can't close the last trove.
        await openTroves(contracts, [alice, bob], "2,000", "200")

        // Give Alice extra MUSD to pay back fees.
        await contracts.musd.unprotectedMint(alice.wallet, to1e18("1,000"))

        await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

        expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
          false,
        )
      })

      it("contains(): returns true for addresses that opened, closed and then re-opened a trove", async () => {
        // Need to open two troves so that we can close Alice's. We can't close the last trove.
        await openTroves(contracts, [alice, bob], "2,000", "200")

        // Give Alice extra MUSD to pay back fees.
        await contracts.musd.unprotectedMint(alice.wallet, to1e18("1,000"))

        await contracts.borrowerOperations.connect(alice.wallet).closeTrove()

        await openTrove(contracts, {
          musdAmount: "2,000",
          sender: alice.wallet,
        })

        expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
          true,
        )
      })

      it("contains(): returns false when there are no troves in the system", async () => {
        expect(await contracts.sortedTroves.contains(alice.wallet)).to.equal(
          false,
        )
        expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(
          false,
        )
        expect(await contracts.sortedTroves.contains(carol.wallet)).to.equal(
          false,
        )
      })

      it("contains(): true when list size is 1 and the trove is the only one in system", async () => {
        await openTrove(contracts, {
          musdAmount: "3,000",
          sender: whale.wallet,
        })

        expect(await contracts.sortedTroves.contains(whale.wallet)).to.equal(
          true,
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
    context("Balance changes", () => {})

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

  it("getMaxSize(): Returns the maximum list size", async () => {
    const maxBytes32 = BigInt(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    )

    expect(await contracts.sortedTroves.getMaxSize()).to.equal(maxBytes32)
  })

  it("findInsertPosition(): Finds the correct insert position given two addresses that loosely bound the correct position", async () => {
    // Use 1 BTC = $100 to make the math easy.
    await contracts.mockAggregator.setPrice(to1e18(100))

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
