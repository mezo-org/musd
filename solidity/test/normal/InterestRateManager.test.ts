import { expect } from "chai"
import {
  Contracts,
  User,
  fastForwardTime,
  getLatestBlockTimestamp,
  setDefaultFees,
  setupTests,
} from "../helpers"

describe("InterestRateManager", () => {
  let alice: User
  let council: User
  let deployer: User
  let treasury: User
  let contracts: Contracts

  beforeEach(async () => {
    ;({ alice, deployer, council, treasury, contracts } = await setupTests())

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()

    await setDefaultFees(contracts, council)
  })

  describe("proposeInterestRate()", () => {
    it("sets the proposed interest rate", async () => {
      await contracts.interestRateManager
        .connect(council.wallet)
        .proposeInterestRate(100)

      const blockTime = BigInt(await getLatestBlockTimestamp())

      expect(
        await contracts.interestRateManager.proposedInterestRate(),
      ).to.equal(100)
      expect(
        await contracts.interestRateManager.proposedInterestRateTime(),
      ).to.equal(blockTime)
    })
    context("Expected Reverts", () => {
      it("reverts if the proposed rate exceeds the maximum interest rate", async () => {
        await expect(
          contracts.interestRateManager
            .connect(council.wallet)
            .proposeInterestRate(10001),
        ).to.be.revertedWith("Interest rate exceeds the maximum interest rate")
      })
    })
  })

  describe("approveInterestRate()", () => {
    it("requires two transactions to change the interest rate with a 7 day time delay", async () => {
      await contracts.interestRateManager
        .connect(council.wallet)
        .proposeInterestRate(100)

      // Simulate 7 days passing
      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.interestRateManager
        .connect(council.wallet)
        .approveInterestRate()
      expect(await contracts.interestRateManager.interestRate()).to.equal(100)
    })

    context("Expected Reverts", () => {
      it("reverts if the time delay has not finished", async () => {
        await contracts.interestRateManager
          .connect(council.wallet)
          .proposeInterestRate(100)

        // Simulate 6 days passing
        const timeToIncrease = 6 * 24 * 60 * 60 // 6 days in seconds
        await fastForwardTime(timeToIncrease)

        await expect(
          contracts.interestRateManager
            .connect(council.wallet)
            .approveInterestRate(),
        ).to.be.revertedWith("Proposal delay not met")
      })

      it("reverts if called by a non-governance address", async () => {
        await contracts.interestRateManager
          .connect(council.wallet)
          .proposeInterestRate(100)

        // Simulate 6 days passing
        const timeToIncrease = 6 * 24 * 60 * 60 // 6 days in seconds
        await fastForwardTime(timeToIncrease)

        await expect(
          contracts.interestRateManager
            .connect(alice.wallet)
            .approveInterestRate(),
        ).to.be.revertedWith(
          "InterestRateManager: Only governance can call this function",
        )
      })
    })
  })
})
