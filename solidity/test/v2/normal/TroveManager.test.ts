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

  it("should return the current interest rate", async () => {
    expect(await contracts.troveManager.getInterestRate()).to.equal(0n)
  })

  it("should allow for setting the maximum interest rate", async () => {
    await contracts.troveManager.setMaxInterestRate(5n)
    expect(await contracts.troveManager.getMaxInterestRate()).to.equal(5n)
  })

  it("proposeInterestRate(): Reverts when called by  should revert when not called by owner or governance", async () => {
    await expect(
      contracts.troveManager.proposeInterestRate(5n),
    ).to.be.revertedWith("TroveManager: Only governance can call this function")
  })
})
