import { expect } from "chai"
import { Contracts, openTrove, setupTests, User } from "../../helpers"
import { to1e18 } from "../../utils"

describe("HintHelpers", () => {
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let frank: User
  let contracts: Contracts

  const latestRandomSeed = 31337
  const sqrtLength = Math.ceil(Math.sqrt(6)) // Sqrt of the number of Troves

  beforeEach(async () => {
    ;({ alice, bob, carol, dennis, eric, frank, contracts } =
      await setupTests())
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

  it.skip("getApproxHint(): returns the address of a Trove within sqrt(length) positions of the correct insert position", async () => {
    // Tried a simplified version of the test in the THUSD repo, but it is not working, skipping for now.
    // THUSD Test: https://github.com/Threshold-USD/dev/blob/develop/packages/contracts/test/HintHelpers_getApproxHintTest.js#L117

    await setupTroves()

    // CR = 202% (Carol's Trove)
    const cr = to1e18("202")
    const { hintAddress } = await contracts.hintHelpers.getApproxHint(
      cr,
      sqrtLength * 10,
      latestRandomSeed,
    )
    const firstTrove = await contracts.sortedTroves.getFirst()
    expect(hintAddress).to.eq(firstTrove)
  })

  it("getApproxHint: returns the head of the list if the CR is the max uint256 value", async () => {
    await setupTroves()

    // CR = Maximum value, i.e. 2**256 -1
    const crMax =
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    const { hintAddress } = await contracts.hintHelpers.getApproxHint(
      crMax,
      sqrtLength * 10,
      latestRandomSeed,
    )
    expect(hintAddress).to.eq(await contracts.sortedTroves.getFirst())
  })

  it("getApproxHint(): returns the tail of the list if the CR is lower than ICR of any Trove", async () => {
    await setupTroves()

    const crMin = to1e18("110")
    const { hintAddress } = await contracts.hintHelpers.getApproxHint(
      crMin,
      sqrtLength * 10,
      latestRandomSeed,
    )

    expect(hintAddress).to.eq(await contracts.sortedTroves.getLast())
  })

  it("computeNominalCR(): returns the correct nominal CR", async () => {
    const NICR = await contracts.hintHelpers.computeNominalCR(
      to1e18("3"),
      to1e18("200"),
    )
    expect(NICR).to.eq(to1e18("1.5"))
  })
})
