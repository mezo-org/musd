import { expect } from "chai"
import { to1e18 } from "../utils"

import { Contracts, User, getDeployedContract, setupTests } from "../helpers"
import type { PriceFeed } from "../../typechain"

describe("PriceFeed in Normal Mode", () => {
  let contracts: Contracts
  let deployer: User

  beforeEach(async () => {
    ;({ deployer, contracts } = await setupTests())
  })

  describe("setOracle()", () => {
    it("Updates the oracle address", async () => {
      const priceFeed: PriceFeed = await getDeployedContract(
        "UnconnectedPriceFeed",
      )

      const mockAggregatorAddress = await contracts.mockAggregator.getAddress()

      await priceFeed.connect(deployer.wallet).setOracle(mockAggregatorAddress)

      expect(await priceFeed.oracle()).to.equal(mockAggregatorAddress)
    })

    context("Expected Reverts", () => {
      it("Reverts when the oracle has 0-decimal precision", async () => {
        const priceFeed: PriceFeed = await getDeployedContract(
          "UnconnectedPriceFeed",
        )

        const mockAggregatorAddress =
          await contracts.mockAggregator.getAddress()

        await contracts.mockAggregator.connect(deployer.wallet).setPrecision(0n)

        await expect(
          priceFeed.connect(deployer.wallet).setOracle(mockAggregatorAddress),
        ).to.be.revertedWith("Invalid Decimals from Oracle")
      })

      it("Reverts when the oracle has a price of 0", async () => {
        const priceFeed: PriceFeed = await getDeployedContract(
          "UnconnectedPriceFeed",
        )

        const mockAggregatorAddress =
          await contracts.mockAggregator.getAddress()

        await contracts.mockAggregator.setPrice(0n)

        await expect(
          priceFeed.connect(deployer.wallet).setOracle(mockAggregatorAddress),
        ).to.be.revertedWith("Oracle returns 0 for price")
      })
    })
  })

  describe("fetchPrice()", () => {
    it("Handles an 8 decimal oracle", async () => {
      await contracts.mockAggregator.setPrecision(8n)
      expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
        to1e18("50,000"),
      )
    })

    it("Handles an 18 decimal oracle", async () => {
      await contracts.mockAggregator.setPrecision(18n)
      expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
        to1e18("50,000"),
      )
    })

    it("Handles a 25 decimal oracle", async () => {
      await contracts.mockAggregator.setPrecision(25n)
      expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
        to1e18("50,000"),
      )
    })
  })
})
