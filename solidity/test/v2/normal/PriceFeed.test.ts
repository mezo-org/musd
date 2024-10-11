import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { ZERO_ADDRESS, to1e18 } from "../../utils"

import {
  ContractsV2,
  fixtureV2,
  getDeployedContract,
  TestSetupV2,
  connectContracts,
  User,
} from "../../helpers"
import type { PriceFeed } from "../../../typechain"

describe("PriceFeed in Normal Mode", () => {
  let contracts: ContractsV2
  let cachedTestSetup: TestSetupV2
  let testSetup: TestSetupV2
  let deployer: User

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixtureV2)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    // users
    deployer = testSetup.users.deployer

    await connectContracts(contracts, testSetup.users)
  })

  describe("setOracle()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("setOracle(): Reverts when trying to set the oracle a second time", async () => {
        await expect(
          contracts.priceFeed.connect(deployer.wallet).setOracle(ZERO_ADDRESS),
        )
          .to.be.revertedWithCustomError(
            contracts.pcv,
            "OwnableUnauthorizedAccount",
          )
          .withArgs(deployer.address)
      })

      it("setOracle(): Reverts when the oracle has 0-decimal precision", async () => {
        const priceFeed: PriceFeed = await getDeployedContract(
          "UnconnectedPriceFeed",
        )

        const mockAggregatorAddress =
          await contracts.mockAggregator.getAddress()

        await contracts.mockAggregator.setPrecision(0n)

        await expect(
          priceFeed.connect(deployer.wallet).setOracle(mockAggregatorAddress),
        ).to.be.revertedWith("Invalid Decimals from Oracle")
      })

      it("setOracle(): Reverts when the oracle has a price of 0", async () => {
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

    /**
     *
     * Emitted Events
     *
     */
    context("Emitted Events", () => {})

    /**
     *
     * System State Changes
     *
     */
    context("System State Changes", () => {
      it("setOracle(): Updates the oracle address", async () => {
        const priceFeed: PriceFeed = await getDeployedContract(
          "UnconnectedPriceFeed",
        )

        const mockAggregatorAddress =
          await contracts.mockAggregator.getAddress()

        await priceFeed
          .connect(deployer.wallet)
          .setOracle(mockAggregatorAddress)

        expect(await priceFeed.oracle()).to.equal(mockAggregatorAddress)
      })
    })

    /**
     *
     * Individual Troves
     *
     */
    context("Individual Troves", () => {})

    /**
     *
     * Balance changes
     *
     */
    context("Balance changes", () => {})

    /**
     *
     * Fees
     *
     */
    context("Fees", () => {})

    /**
     *
     * State change in other contracts
     *
     */
    context("State change in other contracts", () => {})
  })

  describe("fetchPrice()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {})

    /**
     *
     * Emitted Events
     *
     */
    context("Emitted Events", () => {})

    /**
     *
     * System State Changes
     *
     */
    context("System State Changes", () => {
      it("fetchPrice(): Handles an 8 decimal oracle", async () => {
        await contracts.mockAggregator.setPrecision(8n)
        expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
          to1e18("50,000"),
        )
      })

      it("fetchPrice(): Handles an 18 decimal oracle", async () => {
        await contracts.mockAggregator.setPrecision(18n)
        expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
          to1e18("50,000"),
        )
      })

      it("fetchPrice(): Handles a 25 decimal oracle", async () => {
        await contracts.mockAggregator.setPrecision(25n)
        expect(await contracts.priceFeed.fetchPrice()).to.be.equal(
          to1e18("50,000"),
        )
      })
    })

    /**
     *
     * Individual Troves
     *
     */
    context("Individual Troves", () => {})

    /**
     *
     * Balance changes
     *
     */
    context("Balance changes", () => {})

    /**
     *
     * Fees
     *
     */
    context("Fees", () => {})

    /**
     *
     * State change in other contracts
     *
     */
    context("State change in other contracts", () => {})
  })
})
