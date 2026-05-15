import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  MockERC20,
  MockGovernableVariables,
  ActivePoolERC20,
  DefaultPoolERC20,
  CollSurplusPoolERC20,
  BorrowerOperationsERC20,
  TroveManagerERC20,
  StabilityPoolERC20,
  PCVERC20,
  MockInterestRateManager,
  MockPriceFeed,
  SortedTroves,
  MUSD,
} from "../../typechain"

/**
 * Integration Tests for ERC20 Collateral System
 *
 * These tests verify the full system works together by deploying all ERC20 contracts,
 * wiring them together, and testing actual user flows.
 */
describe("Integration: ERC20 Collateral System", () => {
  // Contracts
  let collateralToken: MockERC20
  let musd: MUSD
  let activePool: ActivePoolERC20
  let defaultPool: DefaultPoolERC20
  let collSurplusPool: CollSurplusPoolERC20
  let stabilityPool: StabilityPoolERC20
  let troveManager: TroveManagerERC20
  let borrowerOperations: BorrowerOperationsERC20
  let pcv: PCVERC20
  let sortedTroves: SortedTroves
  let mockInterestRateManager: MockInterestRateManager
  let mockPriceFeed: MockPriceFeed

  // Mock contracts for addresses that don't need full implementation
  let mockGasPool: MockERC20 // Using MockERC20 as it has code (for checkContract)
  let mockGovernableVariables: MockGovernableVariables

  // Signers
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner

  // Constants
  const PRICE = ethers.parseEther("50000") // $50,000 per collateral unit
  const GAS_COMPENSATION = ethers.parseEther("200") // Gas compensation

  /**
   * Deploy and wire all ERC20 contracts together
   */
  async function deployFullSystem() {
    ;[, alice, bob] = await ethers.getSigners()

    // 1. Deploy MockERC20 (collateral token)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    collateralToken = await MockERC20Factory.deploy()

    // 2. Deploy MUSD (debt token)
    const MUSDFactory = await ethers.getContractFactory("MUSD")
    musd = await MUSDFactory.deploy()

    // 3. Deploy mock helper contracts
    mockGasPool = await MockERC20Factory.deploy()

    // Deploy MockGovernableVariables
    const MockGovernableVariablesFactory = await ethers.getContractFactory(
      "MockGovernableVariables",
    )
    mockGovernableVariables = await MockGovernableVariablesFactory.deploy()

    // 4. Deploy MockInterestRateManager
    const MockInterestRateManagerFactory = await ethers.getContractFactory(
      "MockInterestRateManager",
    )
    mockInterestRateManager = await MockInterestRateManagerFactory.deploy()

    // 5. Deploy MockPriceFeed
    const MockPriceFeedFactory =
      await ethers.getContractFactory("MockPriceFeed")
    mockPriceFeed = await MockPriceFeedFactory.deploy()
    await mockPriceFeed.setPrice(PRICE)

    const tokenAddress = await collateralToken.getAddress()

    // 6. Deploy ActivePoolERC20
    const ActivePoolERC20Factory =
      await ethers.getContractFactory("ActivePoolERC20")
    activePool = (await upgrades.deployProxy(
      ActivePoolERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as ActivePoolERC20

    // 7. Deploy DefaultPoolERC20
    const DefaultPoolERC20Factory =
      await ethers.getContractFactory("DefaultPoolERC20")
    defaultPool = (await upgrades.deployProxy(
      DefaultPoolERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as DefaultPoolERC20

    // 8. Deploy CollSurplusPoolERC20
    const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
      "CollSurplusPoolERC20",
    )
    collSurplusPool = (await upgrades.deployProxy(
      CollSurplusPoolERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as CollSurplusPoolERC20

    // 9. Deploy StabilityPoolERC20
    const StabilityPoolERC20Factory =
      await ethers.getContractFactory("StabilityPoolERC20")
    stabilityPool = (await upgrades.deployProxy(
      StabilityPoolERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as StabilityPoolERC20

    // 10. Deploy TroveManagerERC20
    const TroveManagerERC20Factory =
      await ethers.getContractFactory("TroveManagerERC20")
    troveManager = (await upgrades.deployProxy(
      TroveManagerERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as TroveManagerERC20

    // 11. Deploy PCVERC20
    const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
    pcv = (await upgrades.deployProxy(
      PCVERC20Factory,
      [tokenAddress, 0], // 0 governance time delay for testing
      { initializer: "initialize" },
    )) as unknown as PCVERC20

    // 12. Deploy BorrowerOperationsERC20
    const BorrowerOperationsERC20Factory = await ethers.getContractFactory(
      "BorrowerOperationsERC20",
    )
    borrowerOperations = (await upgrades.deployProxy(
      BorrowerOperationsERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as BorrowerOperationsERC20

    // 13. Deploy SortedTroves
    const SortedTrovesFactory = await ethers.getContractFactory("SortedTroves")
    sortedTroves = (await upgrades.deployProxy(SortedTrovesFactory, [], {
      initializer: "initialize",
    })) as unknown as SortedTroves

    // Get all addresses
    const activePoolAddress = await activePool.getAddress()
    const defaultPoolAddress = await defaultPool.getAddress()
    const collSurplusPoolAddress = await collSurplusPool.getAddress()
    const stabilityPoolAddress = await stabilityPool.getAddress()
    const troveManagerAddress = await troveManager.getAddress()
    const pcvAddress = await pcv.getAddress()
    const borrowerOperationsAddress = await borrowerOperations.getAddress()
    const sortedTrovesAddress = await sortedTroves.getAddress()
    const interestRateManagerAddress =
      await mockInterestRateManager.getAddress()
    const priceFeedAddress = await mockPriceFeed.getAddress()
    const gasPoolAddress = await mockGasPool.getAddress()
    const governableVariablesAddress =
      await mockGovernableVariables.getAddress()
    const musdAddress = await musd.getAddress()

    // Wire all contracts together

    // Set addresses for ActivePool
    await activePool.setAddresses(
      borrowerOperationsAddress,
      collSurplusPoolAddress,
      defaultPoolAddress,
      interestRateManagerAddress,
      stabilityPoolAddress,
      troveManagerAddress,
    )

    // Set addresses for DefaultPool
    await defaultPool.setAddresses(activePoolAddress, troveManagerAddress)

    // Set addresses for CollSurplusPool
    await collSurplusPool.setAddresses(
      activePoolAddress,
      borrowerOperationsAddress,
      troveManagerAddress,
    )

    // Set addresses for StabilityPool
    await stabilityPool.setAddresses(
      activePoolAddress,
      borrowerOperationsAddress,
      musdAddress,
      priceFeedAddress,
      sortedTrovesAddress,
      troveManagerAddress,
    )

    // Set addresses for TroveManager
    await troveManager.setAddresses(
      activePoolAddress,
      borrowerOperationsAddress,
      collSurplusPoolAddress,
      defaultPoolAddress,
      gasPoolAddress,
      interestRateManagerAddress,
      musdAddress,
      pcvAddress,
      priceFeedAddress,
      sortedTrovesAddress,
      stabilityPoolAddress,
    )

    // Set addresses for PCV
    await pcv.setAddresses(
      borrowerOperationsAddress,
      musdAddress,
      stabilityPoolAddress,
    )

    // Set addresses for BorrowerOperations
    await borrowerOperations.setAddresses(
      activePoolAddress,
      collSurplusPoolAddress,
      defaultPoolAddress,
      gasPoolAddress,
      governableVariablesAddress,
      interestRateManagerAddress,
      musdAddress,
      pcvAddress,
      priceFeedAddress,
      sortedTrovesAddress,
      stabilityPoolAddress,
      troveManagerAddress,
    )

    // Set params for SortedTroves
    await sortedTroves.setParams(
      1000000, // max size
      borrowerOperationsAddress,
      troveManagerAddress,
    )

    // Initialize MUSD with system contracts
    await musd.initialize(
      troveManagerAddress,
      stabilityPoolAddress,
      borrowerOperationsAddress,
      interestRateManagerAddress,
    )
  }

  beforeEach(async () => {
    await deployFullSystem()
  })

  describe("System Setup Verification", () => {
    it("should have all contracts deployed and wired correctly", async () => {
      // Verify collateral token is set on all contracts
      expect(await activePool.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
      expect(await defaultPool.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
      expect(await collSurplusPool.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
      expect(await stabilityPool.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
      expect(await troveManager.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
      expect(await pcv.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
      expect(await borrowerOperations.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
    })

    it("should have MUSD initialized with correct permissions", async () => {
      expect(
        await musd.mintList(await borrowerOperations.getAddress()),
      ).to.equal(true)
      expect(
        await musd.burnList(await borrowerOperations.getAddress()),
      ).to.equal(true)
      expect(await musd.burnList(await stabilityPool.getAddress())).to.equal(
        true,
      )
      expect(await musd.burnList(await troveManager.getAddress())).to.equal(
        true,
      )
    })

    it("should have zero collateral and debt initially", async () => {
      expect(await activePool.getCollateralBalance()).to.equal(0)
      expect(await activePool.getDebt()).to.equal(0)
      expect(await defaultPool.getCollateralBalance()).to.equal(0)
      expect(await defaultPool.getDebt()).to.equal(0)
      expect(await borrowerOperations.getEntireSystemColl()).to.equal(0)
      expect(await borrowerOperations.getEntireSystemDebt()).to.equal(0)
    })
  })

  describe("Full Trove Lifecycle", () => {
    const collAmount = ethers.parseEther("10") // 10 tokens
    const debtAmount = ethers.parseEther("100000") // 100,000 mUSD
    // With 10 tokens at $50,000 each = $500,000 collateral
    // Borrowing 100,000 mUSD gives ICR = 500,000 / 100,000 = 500% = 5e18

    beforeEach(async () => {
      // Mint collateral to Alice
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      // Approve BorrowerOperations to spend collateral
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )
    })

    it("should allow user to open a trove with ERC20 collateral", async () => {
      const aliceCollBefore = await collateralToken.balanceOf(alice.address)
      const activePoolCollBefore = await activePool.getCollateralBalance()

      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Verify collateral moved from Alice to ActivePool
      const aliceCollAfter = await collateralToken.balanceOf(alice.address)
      const activePoolCollAfter = await activePool.getCollateralBalance()

      expect(aliceCollBefore - aliceCollAfter).to.equal(collAmount)
      expect(activePoolCollAfter - activePoolCollBefore).to.equal(collAmount)

      // Verify trove is active
      expect(await troveManager.getTroveStatus(alice.address)).to.equal(1) // active

      // Verify Alice received mUSD
      expect(await musd.balanceOf(alice.address)).to.equal(debtAmount)

      // Verify trove data
      expect(await troveManager.getTroveColl(alice.address)).to.equal(
        collAmount,
      )
    })

    it("should allow user to add collateral to existing trove", async () => {
      // Open trove first
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const addAmount = ethers.parseEther("2")
      const trovCollBefore = await troveManager.getTroveColl(alice.address)
      const activePoolCollBefore = await activePool.getCollateralBalance()

      await borrowerOperations
        .connect(alice)
        .addColl(addAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      const trovCollAfter = await troveManager.getTroveColl(alice.address)
      const activePoolCollAfter = await activePool.getCollateralBalance()

      expect(trovCollAfter - trovCollBefore).to.equal(addAmount)
      expect(activePoolCollAfter - activePoolCollBefore).to.equal(addAmount)
    })

    it("should allow user to withdraw collateral from trove", async () => {
      // Open trove first
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const withdrawAmount = ethers.parseEther("1")
      const aliceCollBefore = await collateralToken.balanceOf(alice.address)
      const trovCollBefore = await troveManager.getTroveColl(alice.address)

      await borrowerOperations
        .connect(alice)
        .withdrawColl(withdrawAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      const aliceCollAfter = await collateralToken.balanceOf(alice.address)
      const trovCollAfter = await troveManager.getTroveColl(alice.address)

      expect(aliceCollAfter - aliceCollBefore).to.equal(withdrawAmount)
      expect(trovCollBefore - trovCollAfter).to.equal(withdrawAmount)
    })

    it("should allow user to borrow more mUSD", async () => {
      // Open trove first
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const borrowAmount = ethers.parseEther("10000")
      const aliceMusdBefore = await musd.balanceOf(alice.address)

      await borrowerOperations
        .connect(alice)
        .withdrawMUSD(borrowAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      const aliceMusdAfter = await musd.balanceOf(alice.address)
      expect(aliceMusdAfter - aliceMusdBefore).to.equal(borrowAmount)
    })

    it("should allow user to repay mUSD", async () => {
      // Open trove first
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const repayAmount = ethers.parseEther("10000")
      const aliceMusdBefore = await musd.balanceOf(alice.address)
      const troveDebtBefore = await troveManager.getTroveDebt(alice.address)

      // Approve MUSD spending
      await musd
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), repayAmount)

      await borrowerOperations
        .connect(alice)
        .repayMUSD(repayAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      const aliceMusdAfter = await musd.balanceOf(alice.address)
      const troveDebtAfter = await troveManager.getTroveDebt(alice.address)

      expect(aliceMusdBefore - aliceMusdAfter).to.equal(repayAmount)
      expect(troveDebtBefore - troveDebtAfter).to.equal(repayAmount)
    })

    it("should allow user to close trove and return collateral", async () => {
      // Open trove first
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Alice needs more MUSD to close (for gas compensation)
      // The borrowing fee is 0.1%, so total debt = debtAmount + fee + gas comp
      const totalDebt = await troveManager.getTroveDebt(alice.address)

      // Transfer some MUSD to Alice from deployer (mint through BorrowerOps)
      // For simplicity, we'll open another trove with Bob to get MUSD
      await collateralToken.mint(bob.address, ethers.parseEther("100"))
      await collateralToken
        .connect(bob)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )
      await borrowerOperations
        .connect(bob)
        .openTrove(
          ethers.parseEther("10"),
          ethers.parseEther("100000"),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Bob transfers MUSD to Alice so she can close
      const additionalMusdNeeded =
        totalDebt - GAS_COMPENSATION - (await musd.balanceOf(alice.address))
      if (additionalMusdNeeded > 0n) {
        await musd.connect(bob).transfer(alice.address, additionalMusdNeeded)
      }

      const aliceCollBefore = await collateralToken.balanceOf(alice.address)

      // Approve MUSD for repayment
      await musd
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), totalDebt)

      await borrowerOperations.connect(alice).closeTrove()

      const aliceCollAfter = await collateralToken.balanceOf(alice.address)

      // Verify trove is closed
      expect(await troveManager.getTroveStatus(alice.address)).to.equal(2) // closedByOwner

      // Verify collateral returned
      expect(aliceCollAfter - aliceCollBefore).to.equal(collAmount)
    })
  })

  describe("StabilityPool Integration", () => {
    const collAmount = ethers.parseEther("10")
    const debtAmount = ethers.parseEther("100000")

    beforeEach(async () => {
      // Setup: Alice opens a trove to have MUSD
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )
    })

    it("should allow user to deposit MUSD to StabilityPool", async () => {
      const depositAmount = ethers.parseEther("50000")

      // Approve StabilityPool to spend MUSD
      await musd
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)

      const spMusdBefore = await stabilityPool.getTotalMUSDDeposits()

      await stabilityPool.connect(alice).provideToSP(depositAmount)

      const spMusdAfter = await stabilityPool.getTotalMUSDDeposits()
      expect(spMusdAfter - spMusdBefore).to.equal(depositAmount)

      // Verify Alice's deposit is recorded
      const aliceDeposit = await stabilityPool.getCompoundedMUSDDeposit(
        alice.address,
      )
      expect(aliceDeposit).to.equal(depositAmount)
    })

    it("should allow user to withdraw MUSD from StabilityPool", async () => {
      const depositAmount = ethers.parseEther("50000")
      const withdrawAmount = ethers.parseEther("20000")

      // Deposit first
      await musd
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
      await stabilityPool.connect(alice).provideToSP(depositAmount)

      const aliceMusdBefore = await musd.balanceOf(alice.address)

      await stabilityPool.connect(alice).withdrawFromSP(withdrawAmount)

      const aliceMusdAfter = await musd.balanceOf(alice.address)
      expect(aliceMusdAfter - aliceMusdBefore).to.equal(withdrawAmount)

      // Verify remaining deposit
      const aliceDeposit = await stabilityPool.getCompoundedMUSDDeposit(
        alice.address,
      )
      expect(aliceDeposit).to.equal(depositAmount - withdrawAmount)
    })

    it("should track deposits correctly", async () => {
      const depositAmount = ethers.parseEther("50000")

      await musd
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
      await stabilityPool.connect(alice).provideToSP(depositAmount)

      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(depositAmount)
      expect(
        await stabilityPool.getCompoundedMUSDDeposit(alice.address),
      ).to.equal(depositAmount)
      expect(
        await stabilityPool.getDepositorCollateralGain(alice.address),
      ).to.equal(0)
    })
  })

  describe("ActivePool State Tracking", () => {
    it("should track collateral correctly across operations", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      // Open trove
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      expect(await activePool.getCollateralBalance()).to.equal(collAmount)

      // Add collateral
      const addAmount = ethers.parseEther("5")
      await borrowerOperations
        .connect(alice)
        .addColl(addAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      expect(await activePool.getCollateralBalance()).to.equal(
        collAmount + addAmount,
      )

      // Withdraw collateral
      const withdrawAmount = ethers.parseEther("2")
      await borrowerOperations
        .connect(alice)
        .withdrawColl(withdrawAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      expect(await activePool.getCollateralBalance()).to.equal(
        collAmount + addAmount - withdrawAmount,
      )
    })

    it("should track debt correctly across operations", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      // Open trove - debt includes gas compensation
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const initialDebt = await activePool.getDebt()
      expect(initialDebt).to.be.gt(0)

      // Borrow more
      const borrowAmount = ethers.parseEther("10000")
      await borrowerOperations
        .connect(alice)
        .withdrawMUSD(borrowAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      const debtAfterBorrow = await activePool.getDebt()
      expect(debtAfterBorrow).to.be.gt(initialDebt)
    })
  })

  describe("TroveManager State Tracking", () => {
    it("should track trove state correctly", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      // Before opening - trove should not exist
      expect(await troveManager.getTroveStatus(alice.address)).to.equal(0) // nonExistent

      // Open trove
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // After opening
      expect(await troveManager.getTroveStatus(alice.address)).to.equal(1) // active
      expect(await troveManager.getTroveColl(alice.address)).to.equal(
        collAmount,
      )
      expect(await troveManager.getTroveDebt(alice.address)).to.be.gt(
        debtAmount,
      ) // includes gas comp

      // Check ICR
      const icr = await troveManager.getCurrentICR(alice.address, PRICE)
      expect(icr).to.be.gt(ethers.parseEther("1.1")) // Above MCR
    })

    it("should track multiple troves correctly", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup Alice
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      // Setup Bob
      await collateralToken.mint(bob.address, ethers.parseEther("100"))
      await collateralToken
        .connect(bob)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      // Alice opens trove
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Bob opens trove
      await borrowerOperations
        .connect(bob)
        .openTrove(
          ethers.parseEther("5"),
          ethers.parseEther("50000"),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Verify both troves exist
      expect(await troveManager.getTroveStatus(alice.address)).to.equal(1)
      expect(await troveManager.getTroveStatus(bob.address)).to.equal(1)

      // Verify trove count
      expect(await troveManager.getTroveOwnersCount()).to.equal(2)

      // Verify total collateral in ActivePool
      expect(await activePool.getCollateralBalance()).to.equal(
        collAmount + ethers.parseEther("5"),
      )
    })
  })

  describe("System State Getters", () => {
    it("should return correct entire system collateral", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      expect(await borrowerOperations.getEntireSystemColl()).to.equal(
        collAmount,
      )
    })

    it("should return correct entire system debt", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const systemDebt = await borrowerOperations.getEntireSystemDebt()
      // Debt includes gas compensation and any fees
      expect(systemDebt).to.be.gte(debtAmount)
    })

    it("should return correct TCR", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const tcr = await troveManager.getTCR(PRICE)
      // TCR = (collateral * price) / debt
      // Should be well above CCR (150%)
      expect(tcr).to.be.gt(ethers.parseEther("1.5"))
    })
  })

  describe("Collateral Token Movement", () => {
    it("should correctly transfer collateral tokens through the system", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      // Check balances before
      const aliceBefore = await collateralToken.balanceOf(alice.address)
      const activePoolBefore = await collateralToken.balanceOf(
        await activePool.getAddress(),
      )

      // Open trove
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Check balances after
      const aliceAfter = await collateralToken.balanceOf(alice.address)
      const activePoolAfter = await collateralToken.balanceOf(
        await activePool.getAddress(),
      )

      // Verify token movement
      expect(aliceBefore - aliceAfter).to.equal(collAmount)
      expect(activePoolAfter - activePoolBefore).to.equal(collAmount)

      // Verify ActivePool internal tracking matches actual balance
      expect(await activePool.getCollateralBalance()).to.equal(activePoolAfter)
    })

    it("should correctly return collateral when withdrawing", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")
      const withdrawAmount = ethers.parseEther("2")

      // Setup
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )

      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const aliceBefore = await collateralToken.balanceOf(alice.address)

      await borrowerOperations
        .connect(alice)
        .withdrawColl(withdrawAmount, ethers.ZeroAddress, ethers.ZeroAddress)

      const aliceAfter = await collateralToken.balanceOf(alice.address)
      expect(aliceAfter - aliceBefore).to.equal(withdrawAmount)
    })
  })

  describe("Adjust Trove Operations", () => {
    const collAmount = ethers.parseEther("10")
    const debtAmount = ethers.parseEther("100000")

    beforeEach(async () => {
      // Setup Alice with a trove
      await collateralToken.mint(alice.address, ethers.parseEther("100"))
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.parseEther("100"),
        )
      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )
    })

    it("should allow combined collateral deposit and debt increase", async () => {
      const addColl = ethers.parseEther("2")
      const addDebt = ethers.parseEther("20000")

      const trovCollBefore = await troveManager.getTroveColl(alice.address)
      const aliceMusdBefore = await musd.balanceOf(alice.address)

      await borrowerOperations
        .connect(alice)
        .adjustTrove(
          addColl,
          0,
          addDebt,
          true,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const trovCollAfter = await troveManager.getTroveColl(alice.address)
      const aliceMusdAfter = await musd.balanceOf(alice.address)

      expect(trovCollAfter - trovCollBefore).to.equal(addColl)
      expect(aliceMusdAfter - aliceMusdBefore).to.equal(addDebt)
    })

    it("should allow collateral withdrawal with debt repayment", async () => {
      const withdrawColl = ethers.parseEther("1")
      const repayDebt = ethers.parseEther("10000")

      const trovCollBefore = await troveManager.getTroveColl(alice.address)
      const aliceCollBefore = await collateralToken.balanceOf(alice.address)
      const aliceMusdBefore = await musd.balanceOf(alice.address)

      // Approve MUSD for repayment
      await musd
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), repayDebt)

      await borrowerOperations
        .connect(alice)
        .adjustTrove(
          0,
          withdrawColl,
          repayDebt,
          false,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const trovCollAfter = await troveManager.getTroveColl(alice.address)
      const aliceCollAfter = await collateralToken.balanceOf(alice.address)
      const aliceMusdAfter = await musd.balanceOf(alice.address)

      expect(trovCollBefore - trovCollAfter).to.equal(withdrawColl)
      expect(aliceCollAfter - aliceCollBefore).to.equal(withdrawColl)
      expect(aliceMusdBefore - aliceMusdAfter).to.equal(repayDebt)
    })
  })

  describe("Error Cases", () => {
    it("should revert when opening trove with insufficient ICR", async () => {
      // Try to open a trove that would be below MCR (110%)
      const collAmount = ethers.parseEther("1") // 1 token = $50,000
      const debtAmount = ethers.parseEther("50000") // Would give ~100% ICR

      await collateralToken.mint(alice.address, collAmount)
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(
            collAmount,
            debtAmount,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
      )
    })

    it("should revert when withdrawing more collateral than available", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      await collateralToken.mint(alice.address, collAmount)
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Try to withdraw more than deposited
      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawColl(
            ethers.parseEther("20"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.reverted
    })

    it("should revert when non-trove-owner tries to modify trove", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100000")

      await collateralToken.mint(alice.address, collAmount)
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await borrowerOperations
        .connect(alice)
        .openTrove(
          collAmount,
          debtAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Bob tries to withdraw from Alice's trove (he has no trove)
      await expect(
        borrowerOperations
          .connect(bob)
          .withdrawColl(
            ethers.parseEther("1"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })

    it("should revert when opening trove below minimum debt", async () => {
      const collAmount = ethers.parseEther("10")
      const debtAmount = ethers.parseEther("100") // Below minimum (1800)

      await collateralToken.mint(alice.address, collAmount)
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(
            collAmount,
            debtAmount,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith(
        "BorrowerOps: Trove's net debt must be greater than minimum",
      )
    })
  })
})
