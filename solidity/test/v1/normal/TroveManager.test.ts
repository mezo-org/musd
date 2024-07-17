import { expect } from "chai"
import { helpers } from "hardhat"
import { deployment, fastForwardTime } from "../../helpers"

describe.only("TroveManager in Normal Mode", () => {
  it("should return the current interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    expect(await contracts.troveManager.getInterestRate()).to.equal(0)
  })
  it("should set the interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()
    await contracts.troveManager.connect(deployer).updateInterestRate(1)
    expect(await contracts.troveManager.getInterestRate()).to.equal(1)
  })
  it("should revert if a non-whitelisted address tries to set the interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    const [alice] = await helpers.signers.getUnnamedSigners()

    await expect(
      contracts.troveManager.connect(alice).updateInterestRate(1),
    ).to.be.revertedWithCustomError(
      contracts.troveManager,
      "OwnableUnauthorizedAccount",
    )
  })
  it("should emit InterestRateUpdated when the interest rate is updated", async () => {
    const contracts = await deployment(["TroveManager"])
    const { deployer } = await helpers.signers.getNamedSigners()
    await expect(contracts.troveManager.connect(deployer).updateInterestRate(1))
      .to.emit(contracts.troveManager, "InterestRateUpdated")
      .withArgs(1)
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
      contracts.troveManager.connect(deployer).updateInterestRate(101),
    ).to.be.revertedWith("Interest rate exceeds the maximum interest rate")
  })

  it("should revert if a non-whitelisted address tries to set the maximum interest rate", async () => {
    const contracts = await deployment(["TroveManager"])
    const [alice] = await helpers.signers.getUnnamedSigners()

    await expect(
      contracts.troveManager.connect(alice).setMaxInterestRate(1),
    ).to.be.revertedWithCustomError(
      contracts.troveManager,
      "OwnableUnauthorizedAccount",
    )
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
})
