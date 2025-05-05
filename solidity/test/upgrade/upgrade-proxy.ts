import { expect } from "chai"
import { helpers } from "hardhat"

import {
  Contracts,
  User,
  openTrove,
  setupTests,
  updateTroveSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"

describe("Proxy Upgrades", () => {
  let contracts: Contracts
  let carol: User
  let whale: User

  beforeEach(async () => {
    ;({ contracts, carol, whale } = await setupTests())
  })

  const updatePriceFeed = async () =>
    helpers.upgrades.upgradeProxy("PriceFeed", "PriceFeedUpgradeTester")

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

  it("do not change the underlying address", async () => {
    const oldPrice = await contracts.priceFeed.fetchPrice()
    const oldAddress = await contracts.priceFeed.getAddress()
    expect(oldPrice).to.equal(to1e18("50,000"))

    await updatePriceFeed()

    const newPrice = await contracts.priceFeed.fetchPrice()
    const newAddress = await contracts.priceFeed.getAddress()
    expect(newPrice).to.equal(to1e18("45,000"))
    expect(newAddress).to.equal(oldAddress)
  })

  it("automatically interoperate with connected contracts", async () => {
    await openTrove(contracts, {
      musdAmount: "300,000",
      ICR: "200",
      sender: whale.wallet,
    })

    await openTrove(contracts, {
      musdAmount: "2,000",
      ICR: "120",
      sender: carol.wallet,
    })

    // Updating the price feed in place reduces the BTC price from $50k to $45k,
    // lowering carol's ICR to a liquidatable number.
    await updatePriceFeed()

    await contracts.troveManager.connect(whale.wallet).liquidate(carol.wallet)

    await updateTroveSnapshot(contracts, carol, "after")

    expect(carol.trove.debt.after).to.equal(0n)
  })

  it("preserves prior state", async () => {
    const oldOracle = await contracts.priceFeed.oracle()

    await updatePriceFeed()

    const newOracle = await contracts.priceFeed.oracle()

    expect(newOracle).to.equal(oldOracle)
    expect(newOracle).to.equal(await contracts.mockAggregator.getAddress())
  })
})
