import { expect } from "chai"
import { ethers, helpers } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import {
  connectContracts,
  deployment,
  fastForwardTime,
  fixtureBorrowerOperations,
  openTrove,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe.only("TroveManager in Normal Mode", () => {
  it("should return the current interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    expect(await contracts.troveManager.getInterestRate()).to.equal(0)
  })

  it("should allow for setting the maximum interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()
    await contracts.troveManager.connect(deployer).setMaxInterestRate(5)
    expect(await contracts.troveManager.getMaxInterestRate()).to.equal(5)
  })

  it("should revert if the interest rate is above the maximum interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()

    await expect(
      contracts.troveManager.connect(deployer).proposeInterestRate(101),
    ).to.be.revertedWith("Interest rate exceeds the maximum interest rate")
  })

  it("should revert if a non-whitelisted address tries to set the maximum interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    const [alice] = await helpers.signers.getUnnamedSigners()

    await expect(
      contracts.troveManager.connect(alice).setMaxInterestRate(1),
    ).to.be.revertedWith("TroveManager: Only governance can call this function")
  })

  it("should emit MaxInterestRateUpdated when the maximum interest rate is updated", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()
    await expect(
      contracts.troveManager.connect(deployer).setMaxInterestRate(50),
    )
      .to.emit(contracts.troveManager, "MaxInterestRateUpdated")
      .withArgs(50)
  })

  it("should require two transactions to change the interest rate with a 7 day time delay", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()
    await contracts.troveManager.connect(deployer).proposeInterestRate(1)

    // Simulate 7 days passing
    const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
    await fastForwardTime(timeToIncrease)

    await contracts.troveManager.connect(deployer).approveInterestRate()
    expect(await contracts.troveManager.getInterestRate()).to.equal(1)
  })

  it("should revert if the time delay has not finished", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()
    await contracts.troveManager.connect(deployer).proposeInterestRate(1)

    // Simulate 6 days passing
    const timeToIncrease = 6 * 24 * 60 * 60 // 6 days in seconds
    await fastForwardTime(timeToIncrease)

    await expect(
      contracts.troveManager.connect(deployer).approveInterestRate(),
    ).to.be.revertedWith("Proposal delay not met")
  })

  it("should return the interest rate values and the blocks they were set", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()

    const blockNumbers = []

    // Add three interest rates to the history
    for (let i = 1; i <= 3; i++) {
      await contracts.troveManager.connect(deployer).proposeInterestRate(i)
      await fastForwardTime(7 * 24 * 60 * 60) // 7 days in seconds
      await contracts.troveManager.connect(deployer).approveInterestRate()
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

  describe("Calculating interest owed", () => {
    async function setupTroveWithInterestRate(
      interestRate: number,
      daysToFastForward: number,
    ) {
      // Deploy contracts
      const testSetup = await loadFixture(fixtureBorrowerOperations)
      await connectContracts(testSetup.contracts, testSetup.users)
      const { contracts } = testSetup

      // Propose and approve 1% interest rate
      const { deployer } = await helpers.signers.getNamedSigners()
      await contracts.troveManager
        .connect(deployer)
        .proposeInterestRate(interestRate)
      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)
      await contracts.troveManager.connect(deployer).approveInterestRate()

      // Open a trove with 10000 musd in debt.
      // Initial debt will be 10250 musd due to the borrowing fee.
      const [alice] = await helpers.signers.getUnnamedSigners()
      await openTrove(contracts, {
        musdAmount: "10000",
        sender: alice,
      })

      // Fast-forward 30 days
      const thirtyDays = daysToFastForward * 24 * 60 * 60
      await fastForwardTime(thirtyDays)

      return { contracts, alice }
    }

    it("should calculate the interest owed for a trove after 30 days", async () => {
      const { contracts, alice } = await setupTroveWithInterestRate(100, 30)

      // Calculate interest owed, should be roughly 8.42 musd
      const interest = await contracts.troveManager.calculateInterestOwed(alice)
      expect(interest).to.be.equal(8424657511992000000n)
    })

    it("should calculate the interest owed for a trove after 15 days", async () => {
      const { contracts, alice } = await setupTroveWithInterestRate(100, 15)

      // Calculate interest owed, should be roughly 4.21 musd
      const interest = await contracts.troveManager.calculateInterestOwed(alice)
      expect(interest).to.be.equal(4212328755996000000n)
    })
  })
})
