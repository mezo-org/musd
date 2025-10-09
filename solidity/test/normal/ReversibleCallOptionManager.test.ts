import { expect } from "chai"
import { ethers } from "hardhat"
import {
  Contracts,
  TestingAddresses,
  User,
  setupTests,
  openTrove,
  adjustTroveToICR,
  dropPrice,
  setDefaultFees,
  fastForwardTime,
} from "../helpers"
import { to1e18 } from "../utils"

describe("ReversibleCallOptionManager - initializeOption", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let deployer: User
  let treasury: User
  let contracts: Contracts

    // Helper function to calculate required premium
  const calculateRequiredPremium = async (borrower: string): Promise<bigint> => {
    const price = await contracts.priceFeed.fetchPrice()
    const [coll] = await contracts.troveManager.getEntireDebtAndColl(borrower)
    const collateralValue = (coll * price) / to1e18(1)
    
    // Risk-Adjusted Collateral Formula (matching contract logic):
    // Liquidation Value = 85% × Collateral Value
    // Recovery Value = 90% × Liquidation Value = 76.5% × Collateral Value
    // Expected Loss = Collateral Value - Recovery Value = 23.5%
    // Safety Margin = 10%
    // Total Risk = 33.5%
    // λ = 33.5% (clamped to [5%, 50%])
    
    const liquidationThreshold = 85n // 85%
    const recoveryFraction = 90n // 90%
    const safetyMargin = 10n // 10%
    
    const liquidationValue = (liquidationThreshold * collateralValue) / 100n
    const recoveryValue = (liquidationValue * recoveryFraction) / 100n
    const expectedLoss = collateralValue > recoveryValue ? collateralValue - recoveryValue : 0n
    const safetyMarginAmount = (safetyMargin * collateralValue) / 100n
    const totalRisk = expectedLoss + safetyMarginAmount
    
    // Premium = λ × Collateral Value = Total Risk
    // Add 1% buffer for any rounding differences
    return (totalRisk * 101n) / 100n
  }

  beforeEach(async () => {
    ({ contracts, addresses, alice, bob, carol, council, deployer, treasury } = await setupTests())
    
    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()
    
    // Set addresses for ReversibleCallOptionManager
    await contracts.reversibleCallOptionManager
      .connect(deployer.wallet)
      .setAddresses(
        addresses.troveManager,
        addresses.priceFeed,
        addresses.activePool,
        addresses.musd,
        addresses.gasPool
      )
    
    await setDefaultFees(contracts, council)
    
    // Open troves for testing
    // Alice will have a trove that can become undercollateralized
    await openTrove(contracts, {
      musdAmount: "30,000",
      sender: alice.wallet,
      ICR: "150", // 150% ICR
    })
    
    // Bob will be the supporter - use lower collateral so he has more ETH for premiums
    await openTrove(contracts, {
      musdAmount: "10,000",
      sender: bob.wallet,
      ICR: "200", // 200% ICR - uses ~15k worth of ETH as collateral, leaves ~9985k ETH
    })
    
    // Carol for additional tests
    await openTrove(contracts, {
      musdAmount: "20,000",
      sender: carol.wallet,
      ICR: "200",
    })
  })

  describe("Basic Option Initialization", () => {
    it("should create an option for undercollateralized trove", async () => {
      // Make Alice's trove undercollateralized by dropping price
      await dropPrice(contracts, deployer, alice)
      
      const maturityDuration = 3600 // 1 hour
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        maturityDuration,
        { value: premium }
      )
      
      const option = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      
      expect(option.exists).to.equal(true)
      expect(option.borrower).to.equal(alice.wallet.address)
      expect(option.supporter).to.equal(deployer.wallet.address)
      expect(option.phase).to.equal(2) // PreMaturity
      expect(option.premiumPaid).to.be.greaterThan(0)
    })

    it("should calculate lambda within valid range", async () => {
      // Make Alice's trove undercollateralized
      await dropPrice(contracts, deployer, alice)
      
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium }
      )
      
      const option = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      const MIN_LAMBDA = await contracts.reversibleCallOptionManager.MIN_LAMBDA()
      const MAX_LAMBDA = await contracts.reversibleCallOptionManager.MAX_LAMBDA()
      
      expect(option.lambda).to.be.gte(MIN_LAMBDA)
      expect(option.lambda).to.be.lte(MAX_LAMBDA)
    })

    it("should set correct maturity time", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const maturityDuration = 7200 // 2 hours
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      const blockTime = await ethers.provider.getBlock("latest").then(b => b!.timestamp)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        maturityDuration,
        { value: premium }
      )
      
      const option = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      const expectedMaturity = blockTime + maturityDuration
      
      // Allow 10 second tolerance for block time differences
      expect(option.maturityTime).to.be.closeTo(BigInt(expectedMaturity), 10)
    })

    it("should lock supporter's premium in contract", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium }
      )
      
      expect(await contracts.reversibleCallOptionManager.supporterBalances(deployer.wallet.address)).to.equal(premium)
      
      const contractBalance = await ethers.provider.getBalance(await contracts.reversibleCallOptionManager.getAddress())
      expect(contractBalance).to.equal(premium)
    })

    it("should track total premiums collected", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium }
      )
      
      expect(await contracts.reversibleCallOptionManager.totalPremiumsCollected(deployer.wallet.address)).to.equal(premium)
    })

    it("should emit OptionInitialized event", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      await expect(
        contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
          alice.wallet.address,
          3600,
          { value: premium }
        )
      ).to.emit(contracts.reversibleCallOptionManager, "OptionInitialized")
    })

    it("should store collateral and debt values", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium }
      )
      
      const option = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      
      expect(option.collateralAtStart).to.be.gt(0)
      expect(option.debtAtStart).to.be.gt(0)
    })
  })

  describe("Option Initialization Validation", () => {
    it("should revert if trove is healthy (ICR >= MCR)", async () => {
      // Alice's trove is healthy at 150% ICR with MCR of 150%
      // Don't drop price, so trove stays healthy
      
      await expect(
        contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
          alice.wallet.address,
          3600,
          { value: to1e18(1) }
        )
      ).to.be.reverted
    })

    it("should revert if premium is zero", async () => {
      await dropPrice(contracts, deployer, alice)
      
      await expect(
        contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
          alice.wallet.address,
          3600,
          { value: 0 }
        )
      ).to.be.reverted
    })

    it("should revert if option already exists for trove", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium }
      )
      
      // Try to create another option for the same trove (use deployer who has enough ETH)
      await expect(
        contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
          alice.wallet.address,
          3600,
          { value: premium }
        )
      ).to.be.reverted
    })

    it("should revert if trove does not exist", async () => {
      const [randomUser] = await ethers.getSigners()
      
      await expect(
        contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
          randomUser.address,
          3600,
          { value: to1e18(1) }
        )
      ).to.be.reverted
    })

    it("should revert if maturity duration is zero", async () => {
      await dropPrice(contracts, deployer, alice)
      
      await expect(
        contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
          alice.wallet.address,
          0, // Zero maturity duration
          { value: to1e18(1) }
        )
      ).to.be.reverted
    })
  })

  describe("Lambda Calculation", () => {
    it("should calculate lambda based on risk formula", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const minPremium = await calculateRequiredPremium(alice.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: minPremium }
      )
      
      const option = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      
      // Lambda should be 33.5% based on risk formula:
      // Expected Loss = 23.5% (100% - 85% * 90%)
      // Safety Margin = 10%
      // Total = 33.5%
      const expectedLambda = 335n * to1e18(1) / 1000n // 33.5%
      expect(option.lambda).to.equal(expectedLambda)
    })

    it("should respect MIN_LAMBDA boundary", async () => {
      // Note: With current risk formula, lambda is always 33.5%
      // This test verifies MIN_LAMBDA constant exists
      const MIN_LAMBDA = await contracts.reversibleCallOptionManager.MIN_LAMBDA()
      expect(MIN_LAMBDA).to.equal(5n * to1e18(1) / 100n) // 5%
    })

    it("should respect MAX_LAMBDA boundary", async () => {
      // Note: With current risk formula, lambda is always 33.5%
      // This test verifies MAX_LAMBDA constant exists  
      const MAX_LAMBDA = await contracts.reversibleCallOptionManager.MAX_LAMBDA()
      expect(MAX_LAMBDA).to.equal(50n * to1e18(1) / 100n) // 50%
    })
  })

  describe("Multiple Options by Same Supporter", () => {
    it("should allow supporter to create options for multiple troves", async () => {
      // Make both Alice and Carol undercollateralized
      await dropPrice(contracts, deployer, alice)
      await dropPrice(contracts, deployer, carol)
      
      const premiumAlice = await calculateRequiredPremium(alice.wallet.address)
      const premiumCarol = await calculateRequiredPremium(carol.wallet.address)
      
      // Bob creates option for Alice's trove
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premiumAlice }
      )
      
      // Bob creates option for Carol's trove
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        carol.wallet.address,
        3600,
        { value: premiumCarol }
      )
      
      const option1 = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      const option2 = await contracts.reversibleCallOptionManager.getOption(carol.wallet.address)
      
      expect(option1.exists).to.equal(true)
      expect(option2.exists).to.equal(true)
      expect(option1.supporter).to.equal(deployer.wallet.address)
      expect(option2.supporter).to.equal(deployer.wallet.address)
      
      // Total balance should be sum of both premiums
      expect(await contracts.reversibleCallOptionManager.supporterBalances(deployer.wallet.address)).to.equal(premiumAlice + premiumCarol)
    })

    it("should track total premiums for multiple options", async () => {
      await dropPrice(contracts, deployer, alice)
      await dropPrice(contracts, deployer, carol)
      
      const premium1 = await calculateRequiredPremium(alice.wallet.address)
      const premium2 = await calculateRequiredPremium(carol.wallet.address)
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium1 }
      )
      
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        carol.wallet.address,
        3600,
        { value: premium2 }
      )
      
      const totalPremiums = await contracts.reversibleCallOptionManager.totalPremiumsCollected(deployer.wallet.address)
      expect(totalPremiums).to.equal(premium1 + premium2)
    })
  })

  describe("Option Initialization After Previous Option", () => {
    it("should allow new option after previous option was terminated", async () => {
      await dropPrice(contracts, deployer, alice)
      
      // First option
      const premium1 = await calculateRequiredPremium(alice.wallet.address)
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium1 }
      )
      
      // Terminate it
      const terminationFee = await contracts.reversibleCallOptionManager.getTerminationFee(alice.wallet.address)
      await contracts.reversibleCallOptionManager.connect(alice.wallet).terminateEarly(
        alice.wallet.address,
        { value: terminationFee }
      )
      
      // Create new option
      const premium2 = await calculateRequiredPremium(alice.wallet.address)
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        7200,
        { value: premium2 }
      )
      
      const option = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      expect(option.exists).to.equal(true)
      expect(option.phase).to.equal(2) // PreMaturity
      expect(option.premiumPaid).to.be.greaterThan(0)
    })

    it("should allow new option after previous option expired", async () => {
      await dropPrice(contracts, deployer, alice)
      
      // First option with short maturity
      const premium1 = await calculateRequiredPremium(alice.wallet.address)
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        3600,
        { value: premium1 }
      )
      
      // Fast forward past maturity
      await fastForwardTime(3700)
      
      // Default the option (can be called by supporter or borrower after maturity)
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).defaultOption(alice.wallet.address)
      
      // Create new option
      const premium2 = await calculateRequiredPremium(alice.wallet.address)
      await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption(
        alice.wallet.address,
        7200,
        { value: premium2 }
      )
      
      const option = await contracts.reversibleCallOptionManager.getOption(alice.wallet.address)
      expect(option.exists).to.equal(true)
      expect(option.phase).to.equal(2) // PreMaturity
    })
  })

  describe("Gas Estimation", () => {
    it("should estimate gas for option initialization", async () => {
      await dropPrice(contracts, deployer, alice)
      
      const premium = await calculateRequiredPremium(alice.wallet.address)
      
      const gasEstimate = await contracts.reversibleCallOptionManager.connect(deployer.wallet).initializeOption.estimateGas(
        alice.wallet.address,
        3600,
        { value: premium }
      )
      
      expect(gasEstimate).to.be.gt(0)
      expect(gasEstimate).to.be.lt(500000) // Should be reasonable gas usage
    })
  })
})
