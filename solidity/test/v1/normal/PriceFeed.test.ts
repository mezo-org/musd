import { expect } from "chai"
import { deployments, ethers, getNamedAccounts } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

async function getContract(name: string) {
  const deployer = await ethers.provider.getSigner()
  return ethers.getContractAt(
    name,
    (await deployments.get(name)).address,
    deployer,
  )
}

async function deployAndGetContract(name: string) {
  const { deployer } = await getNamedAccounts()
  await deployments.deploy(name, {
    contract: name,
    args: [],
    from: deployer,
    log: true,
    waitConfirmations: 1,
  })
  return getContract(name)
}

async function deployPriceFeed() {
  const priceFeed = await deployAndGetContract("PriceFeed")
  const eightDecimalAggregator = await deployAndGetContract(
    "MockEightDecimalAggregator",
  )
  const eighteenDecimalAggregator = await deployAndGetContract(
    "MockEighteenDecimalAggregator",
  )
  const twentyDecimalAggregator = await deployAndGetContract(
    "MockTwentyDecimalAggregator",
  )

  return {
    priceFeed,
    eightDecimalAggregator,
    eighteenDecimalAggregator,
    twentyDecimalAggregator,
  }
}

describe("PriceFeed in Normal Mode", () => {
  it("Handles an 8 decimal oracle", async () => {
    const { priceFeed, eightDecimalAggregator } =
      await loadFixture(deployPriceFeed)
    await priceFeed.setOracle(await eightDecimalAggregator.getAddress())
    expect(await priceFeed.fetchPrice()).to.be.equal(42n * 10n ** 18n)
  })

  it("Handles an 18 decimal oracle", async () => {
    const { priceFeed, eighteenDecimalAggregator } =
      await loadFixture(deployPriceFeed)
    await priceFeed.setOracle(await eighteenDecimalAggregator.getAddress())
    expect(await priceFeed.fetchPrice()).to.be.equal(42n * 10n ** 18n)
  })

  it("Handles a 20 decimal Oracle", async () => {
    const { priceFeed, twentyDecimalAggregator } =
      await loadFixture(deployPriceFeed)
    await priceFeed.setOracle(await twentyDecimalAggregator.getAddress())
    expect(await priceFeed.fetchPrice()).to.be.equal(42n * 10n ** 18n)
  })
})
