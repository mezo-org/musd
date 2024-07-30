import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import {
  connectContracts,
  connectContractsV2,
  ContractsV2,
  fastForwardTime,
  fixture,
  getLatestBlockTimestamp,
  openTrove,
  openTroveV2,
  TestSetup,
  User,
} from "../../helpers"

describe("BorrowerOperations in Normal Mode", () => {
  let contracts: ContractsV2
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup
  let deployer: User
  let alice: User

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts.v2
    // users
    alice = testSetup.users.alice
    deployer = testSetup.users.deployer
    await connectContractsV2(contracts, testSetup.users)
  })

  it("openTrove(): opens a new Trove with the current interest rate and sets the lastInterestUpdatedTime", async () => {
    // set the current interest rate to 100 bps
    await contracts.troveManager
      .connect(deployer.wallet)
      .proposeInterestRate(100)
    const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
    await fastForwardTime(timeToIncrease)
    await contracts.troveManager.connect(deployer.wallet).approveInterestRate()

    // open a new trove
    await openTroveV2(contracts, {
      musdAmount: "100,000",
      sender: alice.wallet,
    })

    // check that the interest rate on the trove is the current interest rate
    const interestRate = await contracts.troveManager.getTroveInterestRate(
      alice.wallet,
    )
    expect(interestRate).is.equal(100)

    // check that the lastInterestUpdatedTime on the Trove is the current time
    const lastInterestUpdatedTime =
      await contracts.troveManager.getTroveLastInterestUpdateTime(alice.wallet)

    const currentTime = await getLatestBlockTimestamp()

    expect(lastInterestUpdatedTime).is.equal(currentTime)
  })
})
