import { expect } from "chai"
import {
  Contracts,
  dropPrice,
  fastForwardTime,
  openTrove,
  setDefaultFees,
  setInterestRate,
  setupTests,
  updateTroveSnapshot,
  updateTroveSnapshots,
  User,
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

    await setDefaultFees(contracts, council)
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

    it("skips troves with ICR < MCR even if they are out of order in SortedTroves", async () => {
      // Open a trove for Alice with a high ICR so we don't go into recovery mode
      await openTrove(contracts, {
        musdAmount: "20000",
        ICR: "500",
        sender: alice.wallet,
      })

      // Open a trove for Bob with a lower ICR and no interest
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: bob.wallet,
      })

      // Open a trove for Carol with the same ICR as Bob but a high interest rate
      await setInterestRate(contracts, council, 5000)
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: carol.wallet,
      })

      // Open a trove for Dennis with the same ICR as Bob and Carol but no interest
      await setInterestRate(contracts, council, 0)
      await openTrove(contracts, {
        musdAmount: "2000",
        ICR: "200",
        sender: dennis.wallet,
      })
      // Fast-forward time so that Carol's trove is out of order in the sorted list due to interest
      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      // Drop the price so that Dennis and Bob are at 110% ICR and Carol is below due to interest
      await dropPrice(contracts, deployer, dennis, to1e18("110"))

      // Attempt a redemption
      await updateTroveSnapshots(contracts, [bob, carol, dennis], "before")

      // Fully redeem two troves (Dennis and Bob)
      const redemptionAmount =
        dennis.trove.debt.before +
        bob.trove.debt.before -
        2n * (await contracts.troveManager.MUSD_GAS_COMPENSATION())

      const price = await contracts.priceFeed.fetchPrice()

      const { partialRedemptionHintNICR } =
        await contracts.hintHelpers.getRedemptionHints(
          redemptionAmount,
          price,
          0,
        )

      // If we redeem from Bob and Dennis, the last trove should be a full redemption, so the final NICR should be 0
      expect(partialRedemptionHintNICR).to.equal(0n)
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
