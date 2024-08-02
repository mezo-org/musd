import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import {
  Contracts,
  ContractsState,
  TestSetup,
  TestingAddresses,
  User,
  connectContracts,
  fixture,
  getAddresses,
  openTrove,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("StabilityPool in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let state: ContractsState
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    state = testSetup.state

    await connectContracts(contracts, testSetup.users)
    alice = testSetup.users.alice
    addresses = await getAddresses(contracts, testSetup.users)

    // Approve up to $10k to be sent to the stability pool for alice.
    await contracts.musd
      .connect(alice.wallet)
      .approve(addresses.stabilityPool, to1e18(10000))

    // Open a trove for $5k for alice
    await openTrove(contracts, {
      musdAmount: "5000",
      sender: alice.wallet,
    })
  })

  describe("provideToSP()", () => {
    it("provideToSP(): increases the Stability Pool MUSD balance", async () => {
      await contracts.stabilityPool
        .connect(alice.wallet)
        .provideToSP(to1e18(30))

      state.stabilityPool.musd.after =
        await contracts.stabilityPool.getTotalMUSDDeposits()

      expect(state.stabilityPool.musd.after).to.be.equal(to1e18(30))
    })

    it("provideToSP(): updates the user's deposit record in StabilityPool", async () => {
      await contracts.stabilityPool
        .connect(alice.wallet)
        .provideToSP(to1e18(200))

      state.stabilityPool.deposits.after =
        await contracts.stabilityPool.deposits(alice.address)

      expect(state.stabilityPool.deposits.after).to.be.equal(to1e18(200))
    })
  })
})
