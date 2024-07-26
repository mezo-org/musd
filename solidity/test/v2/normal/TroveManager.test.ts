import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

import { ContractsV2, TestSetup, fixture } from "../../helpers"

describe("TroveManager in Normal Mode", () => {
  let contracts: ContractsV2
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  beforeEach(async () => {
    // fixtureBorrowerOperations has a mock trove manager so we can change rates
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts.v2
    // users
  })

  it("should return expected value", async () => {
    expect(await contracts.troveManager.hello()).to.equal(1n)
  })
})
