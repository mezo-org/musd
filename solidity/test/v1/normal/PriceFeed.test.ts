import { expect } from "chai"
import { deployments } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { to1e18 } from "../../utils"

import {
  Contracts,
  TestSetup,
  User,
  fixture,
  getDeployedContract,
} from "../../helpers"
import { MockAggregator } from "../../../typechain"

describe("PriceFeed in Normal Mode", () => {
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup
  let deployer: User

  async function deployAndGetContract(
    name: string,
    args: string[],
  ): Promise<MockAggregator> {
    await deployments.deploy(name, {
      contract: name,
      args,
      from: deployer.wallet.address,
      log: true,
      waitConfirmations: 1,
    })
    // console.log(retval)
    return getDeployedContract(name)
  }

  beforeEach(async () => {
    // fixtureBorrowerOperations has a mock trove manager so we can change rates
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    // users
    deployer = testSetup.users.deployer
  })

  it("Handles an 8 decimal oracle", async () => {
    const mockAggregator: MockAggregator = await deployAndGetContract(
      "MockAggregator",
      ["8"],
    )

    expect(await mockAggregator.decimals()).to.equal(8)

    await contracts.priceFeed
      .connect(deployer.wallet)
      .setOracle(await mockAggregator.getAddress())
    expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
      50000n * 10n ** 18n,
    )

    const price = to1e18("25,000")
    await mockAggregator.connect(deployer.wallet).setPrice(price)
    expect(await contracts.priceFeed.fetchPrice()).to.be.equal(price)
  })

  it("Handles an 18 decimal oracle", async () => {
    // default is 18

    expect(await contracts.mockAggregator.decimals()).to.equal(18)

    await contracts.priceFeed
      .connect(deployer.wallet)
      .setOracle(await contracts.mockAggregator.getAddress())
    expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
      50000n * 10n ** 18n,
    )

    const price = to1e18("25,000")
    await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)
    expect(await contracts.priceFeed.fetchPrice()).to.be.equal(price)
  })
})
