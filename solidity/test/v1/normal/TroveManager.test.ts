import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import {
  connectContracts,
  Contracts,
  // ContractsState,
  fixture,
  getAddresses,
  openTrove,
  TestingAddresses,
  TestSetup,
  User,
  adjustTroveToICR,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("TroveManager in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  // let state: ContractsState
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  beforeEach(async () => {
    // fixtureBorrowerOperations has a mock trove manager so we can change rates
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    // state = testSetup.state

    await connectContracts(contracts, testSetup.users)
    // users
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    // carol = testSetup.users.carol
    // dennis = testSetup.users.dennis
    // eric = testSetup.users.eric
    // deployer = testSetup.users.deployer

    // readability helper
    addresses = await getAddresses(contracts, testSetup.users)

    // open two troves so that we don't go into recovery mode
    await openTrove(contracts, {
      musdAmount: "5000",
      ICR: "400",
      sender: alice.wallet,
    })

    await openTrove(contracts, {
      musdAmount: "50000",
      ICR: "5000",
      sender: bob.wallet,
    })
  })

  it("liquidate(): closes a Trove that has ICR < MCR", async () => {
    const price = await contracts.priceFeed.fetchPrice()
    alice.trove.icr.before = await contracts.troveManager.getCurrentICR(
      addresses.alice,
      price,
    )
    expect(alice.trove.icr.before).to.be.equal(to1e18(4))

    const mcr = (await contracts.troveManager.MCR()).toString()
    expect(mcr).to.be.equal(to1e18(1.1))

    const targetICR = 1111111111111111111n

    await adjustTroveToICR(contracts, alice.wallet, targetICR)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    alice.trove.icr.after = await contracts.troveManager.getCurrentICR(
      alice.wallet,
      price,
    )
    expect(alice.trove.icr.after).to.equal(targetICR)

    // price drops to 1ETH/token:1000THUSD, reducing Alice's ICR below MCR
    await contracts.mockAggregator.setPrice(to1e18(1000))
    const newPrice = await contracts.priceFeed.fetchPrice()

    alice.trove.icr.after = await contracts.troveManager.getCurrentICR(
      addresses.alice,
      newPrice,
    )
    expect(alice.trove.icr.after).to.be.lt(mcr)

    // close trove
    await contracts.troveManager.liquidate(alice.wallet.address)

    // check the Trove is successfully closed, and removed from sortedList
    const status = (
      await contracts.troveManager.Troves(alice.wallet.address)
    )[3]
    expect(status).to.be.equal(3) // status enum 3 corresponds to "Closed by liquidation"

    const aliceTroveIsInSortedList = await contracts.sortedTroves.contains(
      alice.wallet.address,
    )

    expect(aliceTroveIsInSortedList).to.equal(false)
  })
})
