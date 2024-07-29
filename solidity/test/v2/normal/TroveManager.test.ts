import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

import { ethers } from "hardhat"
import {
  ContractsV2,
  TestSetup,
  User,
  fastForwardTime,
  fixture,
} from "../../helpers"

describe("TroveManager in Normal Mode", () => {
  let contracts: ContractsV2
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup
  let deployer: User
  let alice: User

  beforeEach(async () => {
    // fixtureBorrowerOperations has a mock trove manager so we can change rates
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts.v2
    // users
    alice = testSetup.users.alice
    deployer = testSetup.users.deployer
  })

  it("getInterestRate(): Should return the current interest rate", async () => {
    expect(await contracts.troveManager.getInterestRate()).to.equal(0)
  })

  it("getMaxInterestRate(): Should allow for setting the maximum interest rate", async () => {
    await contracts.troveManager.connect(deployer.wallet).setMaxInterestRate(5)
    expect(await contracts.troveManager.getMaxInterestRate()).to.equal(5)
  })

  it("proposeInterestRate(): Reverts if the interest rate is above the maximum interest rate", async () => {
    await expect(
      contracts.troveManager.connect(deployer.wallet).proposeInterestRate(101),
    ).to.be.revertedWith("Interest rate exceeds the maximum interest rate")
  })

  it("setMaxInterestRate(): Reverts if a non-whitelisted address tries to set the maximum interest rate", async () => {
    await expect(
      contracts.troveManager.connect(alice.wallet).setMaxInterestRate(1),
    ).to.be.revertedWith("TroveManager: Only governance can call this function")
  })

  it("setMaxInterestRate(): should emit MaxInterestRateUpdated when the maximum interest rate is updated", async () => {
    await expect(
      contracts.troveManager.connect(deployer.wallet).setMaxInterestRate(50),
    )
      .to.emit(contracts.troveManager, "MaxInterestRateUpdated")
      .withArgs(50)
  })

  it("approveInterestRate(): should require two transactions to change the interest rate with a 7 day time delay", async () => {
    await contracts.troveManager.connect(deployer.wallet).proposeInterestRate(1)

    // Simulate 7 days passing
    const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
    await fastForwardTime(timeToIncrease)

    await contracts.troveManager.connect(deployer.wallet).approveInterestRate()
    expect(await contracts.troveManager.getInterestRate()).to.equal(1)
  })

  it("approveInterestRate(): Reverts if the time delay has not finished", async () => {
    await contracts.troveManager.connect(deployer.wallet).proposeInterestRate(1)

    // Simulate 6 days passing
    const timeToIncrease = 6 * 24 * 60 * 60 // 6 days in seconds
    await fastForwardTime(timeToIncrease)

    await expect(
      contracts.troveManager.connect(deployer.wallet).approveInterestRate(),
    ).to.be.revertedWith("Proposal delay not met")
  })

  it("getInterestRateHistory(): should return the interest rate values and the blocks they were set", async () => {
    const blockNumbers = []

    // Add three interest rates to the history
    for (let i = 1; i <= 3; i++) {
      await contracts.troveManager
        .connect(deployer.wallet)
        .proposeInterestRate(i)
      await fastForwardTime(7 * 24 * 60 * 60) // 7 days in seconds
      await contracts.troveManager
        .connect(deployer.wallet)
        .approveInterestRate()
      blockNumbers.push(await ethers.provider.getBlockNumber())
    }

    const history = await contracts.troveManager.getInterestRateHistory()
    expect(history.length).to.equal(3)
    expect(history[0].interestRate).to.equal(1)
    expect(history[0].blockNumber).to.equal(blockNumbers[0])
    expect(history[1].interestRate).to.equal(2)
    expect(history[1].blockNumber).to.equal(blockNumbers[1])
    expect(history[2].interestRate).to.equal(3)
    expect(history[2].blockNumber).to.equal(blockNumbers[2])
  })
})
