import { expect } from "chai"
import {
  Contracts,
  User,
  fastForwardTime,
  openTrove,
  setInterestRate,
  setupTests,
  updateTroveSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"

describe("HintHelpers", () => {
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let dennis: User
  let deployer: User
  let eric: User
  let frank: User
  let treasury: User
  let contracts: Contracts

  // eslint-disable-next-line prefer-const
  let latestRandomSeed = 31337n
  let hintAddress: string
  const sqrtLength = Math.ceil(Math.sqrt(6)) // Sqrt of the number of Troves

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
      contracts,
    } = await setupTests())

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()
  })

  async function setupTroves() {
    const users = [alice, bob, carol, dennis, eric, frank]
    // Open a trove for each user with ICRs increasing by 1%
    await Promise.all(
      users.map((user, i) =>
        openTrove(contracts, {
          musdAmount: "2000",
          ICR: (200 + i).toString(),
          sender: user.wallet,
        }),
      ),
    )
  }

  describe("getRedemptionHints()", () => {
    it("ignores interest", async () => {
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

      const redeemedAmount = to1e18(1)

      const btcPrice = await contracts.priceFeed.fetchPrice()

      const [firstRedemptionHint, partialRedemptionHintNICR] =
        await contracts.hintHelpers.getRedemptionHints(to1e18(1), btcPrice, 0)

      const redeemedCollateral = (redeemedAmount * to1e18(1)) / btcPrice

      await updateTroveSnapshot(contracts, alice, "after")

      const nICR = await contracts.hintHelpers.computeNominalCR(
        alice.trove.collateral.after - redeemedCollateral,
        alice.trove.debt.after - to1e18(1),
      )

      expect(firstRedemptionHint).to.equal(alice.address)
      expect(partialRedemptionHintNICR).to.equal(nICR)
    })
  })

  describe("getApproxHint()", () => {
    it("returns the address of a Trove within sqrt(length) positions of the correct insert position", async () => {
      await setupTroves()

      // CR = 202% (Carol's Trove)
      const cr = to1e18("202")
      ;({ hintAddress, latestRandomSeed } =
        await contracts.hintHelpers.getApproxHint(
          cr,
          sqrtLength * 10,
          latestRandomSeed,
        ))
      const firstTrove = await contracts.sortedTroves.getFirst()
      expect(hintAddress).to.eq(firstTrove)
    })

    it("returns the head of the list if the CR is the max uint256 value", async () => {
      await setupTroves()

      // CR = Maximum value, i.e. 2**256 -1
      const crMax =
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      ;({ hintAddress, latestRandomSeed } =
        await contracts.hintHelpers.getApproxHint(
          crMax,
          sqrtLength * 10,
          latestRandomSeed,
        ))
      expect(hintAddress).to.eq(await contracts.sortedTroves.getFirst())
    })

    it("returns the tail of the list if the CR is lower than ICR of any Trove", async () => {
      await setupTroves()
      ;({ hintAddress, latestRandomSeed } =
        await contracts.hintHelpers.getApproxHint(
          "0",
          sqrtLength * 10,
          latestRandomSeed,
        ))

      await contracts.sortedTroves.getLast()

      expect(hintAddress).to.eq(await contracts.sortedTroves.getLast())
    })
  })

  describe("computeNominalCR()", () => {
    it("returns the correct nominal CR", async () => {
      const NICR = await contracts.hintHelpers.computeNominalCR(
        to1e18("3"),
        to1e18("200"),
      )
      expect(NICR).to.eq(to1e18("1.5"))
    })
  })
})
