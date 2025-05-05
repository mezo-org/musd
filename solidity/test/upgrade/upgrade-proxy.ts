import { expect } from "chai"
import { helpers } from "hardhat"

import {
  Contracts,
  User,
  setupTests,
} from "../helpers"

describe("Proxy Upgrades", () => {
  let contracts: Contracts
  let deployer: User

  beforeEach(async () => {
    ;({ contracts, deployer } = await setupTests())
  })

  it("upgrades InterestRateManager contract correctly", async () => {
    const interestRate = await contracts.interestRateManager.interestRate()

    const [upgradeInterestRateManager] = await helpers.upgrades.upgradeProxy(
      "InterestRateManager",
      "InterestRateManagerV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradeInterestRateManager.interestRate()).to.equal(
      interestRate,
    )

    // new functionality works
    await upgradeInterestRateManager.newFunction()
    expect(await upgradeInterestRateManager.newField()).to.equal(881)
  })

  it("upgrades BorrowerOperations contract correctly", async () => {
    const [upgradedBorrowerOperations] = await helpers.upgrades.upgradeProxy(
      "BorrowerOperations",
      "BorrowerOperationsV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradedBorrowerOperations.stabilityPoolAddress()).to.equal(
      await contracts.stabilityPool.getAddress(),
    )

    // new functionality works
    await upgradedBorrowerOperations.newFunction()
    expect(await upgradedBorrowerOperations.newField()).to.equal(886)
  })

  it("upgrades TroveManager contract correctly", async () => {
    const [upgradedTroveManager] = await helpers.upgrades.upgradeProxy(
      "TroveManagerTester",
      "TroveManagerV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradedTroveManager.stabilityPool()).to.equal(
      await contracts.stabilityPool.getAddress(),
    )

    // new functionality works
    await upgradedTroveManager.newFunction()
    expect(await upgradedTroveManager.newField()).to.equal(1000)
  })

  it("upgrades StabilityPool contract correctly", async () => {
    const [upgradedStabilityPool] = await helpers.upgrades.upgradeProxy(
      "StabilityPool",
      "StabilityPoolV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradedStabilityPool.borrowerOperations()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // new functionality works
    await upgradedStabilityPool.newFunction()
    expect(await upgradedStabilityPool.newField()).to.equal(701)
  })

  it("upgrades CollSurplusPool contract correctly", async () => {
    const [upgradedCollSurplusPool] = await helpers.upgrades.upgradeProxy(
      "CollSurplusPool",
      "CollSurplusPoolV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradedCollSurplusPool.borrowerOperationsAddress()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // new functionality works
    await upgradedCollSurplusPool.newFunction()
    expect(await upgradedCollSurplusPool.newField()).to.equal(102)
  })

  it("upgrades ActivePool contract correctly", async () => {
    const [upgradedActivePool] = await helpers.upgrades.upgradeProxy(
      "ActivePool",
      "ActivePoolV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradedActivePool.borrowerOperationsAddress()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // new functionality works
    await upgradedActivePool.newFunction()
    expect(await upgradedActivePool.newField()).to.equal(610)
  })

  it("upgrades DefaultPool contract correctly", async () => {
    const [upgradedDefaultPool] = await helpers.upgrades.upgradeProxy(
      "DefaultPool",
      "DefaultPoolV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradedDefaultPool.activePoolAddress()).to.equal(
      await contracts.activePool.getAddress(),
    )

    // new functionality works
    await upgradedDefaultPool.newFunction()
    expect(await upgradedDefaultPool.newField()).to.equal(213)
  })

  it("upgrades PriceFeed contract correctly", async () => {
    const [upgradedPriceFeed] = await helpers.upgrades.upgradeProxy(
      "PriceFeed",
      "PriceFeedV2",
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    // state preserved and previous functionality works
    expect(await upgradedPriceFeed.owner()).to.equal(
      deployer.address
    )

    // new functionality works
    await upgradedPriceFeed.newFunction()
    expect(await upgradedPriceFeed.newField()).to.equal(398)
  })
})
