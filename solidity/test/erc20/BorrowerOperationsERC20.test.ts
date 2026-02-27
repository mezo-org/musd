import { expect } from "chai"
import { ethers, network, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  MockERC20,
  MockContract,
  MockInterestRateManager,
  MockPriceFeed,
  ActivePoolERC20,
  DefaultPoolERC20,
  CollSurplusPoolERC20,
  BorrowerOperationsERC20,
  TroveManagerERC20,
} from "../../typechain"

describe("BorrowerOperationsERC20", () => {
  let token: MockERC20
  let borrowerOperations: BorrowerOperationsERC20
  let activePool: ActivePoolERC20
  let defaultPool: DefaultPoolERC20
  let collSurplusPool: CollSurplusPoolERC20
  let troveManager: TroveManagerERC20
  let mockInterestRateManager: MockInterestRateManager
  let mockPriceFeed: MockPriceFeed

  // Mock contracts for address validation
  let mockGasPool: MockContract
  let mockGovernableVariables: MockContract
  let mockMUSD: MockContract
  let mockPCV: MockContract
  let mockSortedTroves: MockContract
  let mockStabilityPool: MockContract

  // Signers
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner

  // Addresses
  let gasPoolAddress: string
  let governableVariablesAddress: string
  let musdAddress: string
  let pcvAddress: string
  let sortedTrovesAddress: string
  let stabilityPoolAddress: string

  // Price in 18 decimals - $50,000 per collateral unit
  const PRICE = ethers.parseEther("50000")

  beforeEach(async () => {
    ;[deployer, alice] = await ethers.getSigners()

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()

    // Deploy mock contracts for checkContract validation
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockGasPool = await MockContractFactory.deploy()
    mockGovernableVariables = await MockContractFactory.deploy()
    mockMUSD = await MockContractFactory.deploy()
    mockPCV = await MockContractFactory.deploy()
    mockSortedTroves = await MockContractFactory.deploy()
    mockStabilityPool = await MockContractFactory.deploy()

    // Deploy MockInterestRateManager
    const MockInterestRateManagerFactory = await ethers.getContractFactory(
      "MockInterestRateManager",
    )
    mockInterestRateManager = await MockInterestRateManagerFactory.deploy()

    // Deploy MockPriceFeed
    const MockPriceFeedFactory =
      await ethers.getContractFactory("MockPriceFeed")
    mockPriceFeed = await MockPriceFeedFactory.deploy()
    await mockPriceFeed.setPrice(PRICE)

    // Store addresses
    gasPoolAddress = await mockGasPool.getAddress()
    governableVariablesAddress = await mockGovernableVariables.getAddress()
    musdAddress = await mockMUSD.getAddress()
    pcvAddress = await mockPCV.getAddress()
    sortedTrovesAddress = await mockSortedTroves.getAddress()
    stabilityPoolAddress = await mockStabilityPool.getAddress()

    // Deploy real ERC20 pool contracts as upgradeable proxies
    const tokenAddress = await token.getAddress()

    const ActivePoolERC20Factory =
      await ethers.getContractFactory("ActivePoolERC20")
    activePool = (await upgrades.deployProxy(
      ActivePoolERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as ActivePoolERC20

    const DefaultPoolERC20Factory =
      await ethers.getContractFactory("DefaultPoolERC20")
    defaultPool = (await upgrades.deployProxy(
      DefaultPoolERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as DefaultPoolERC20

    const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
      "CollSurplusPoolERC20",
    )
    collSurplusPool = (await upgrades.deployProxy(
      CollSurplusPoolERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as CollSurplusPoolERC20

    // Deploy TroveManagerERC20
    const TroveManagerERC20Factory =
      await ethers.getContractFactory("TroveManagerERC20")
    troveManager = (await upgrades.deployProxy(
      TroveManagerERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as TroveManagerERC20

    // Deploy BorrowerOperationsERC20 as upgradeable proxy
    const BorrowerOperationsERC20Factory = await ethers.getContractFactory(
      "BorrowerOperationsERC20",
    )
    borrowerOperations = (await upgrades.deployProxy(
      BorrowerOperationsERC20Factory,
      [tokenAddress],
      { initializer: "initialize" },
    )) as unknown as BorrowerOperationsERC20

    const borrowerOperationsAddress = await borrowerOperations.getAddress()
    const activePoolAddress = await activePool.getAddress()
    const defaultPoolAddress = await defaultPool.getAddress()
    const collSurplusPoolAddress = await collSurplusPool.getAddress()
    const troveManagerAddress = await troveManager.getAddress()
    const interestRateManagerAddress =
      await mockInterestRateManager.getAddress()
    const priceFeedAddress = await mockPriceFeed.getAddress()

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

    // Impersonate mock contract addresses for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [pcvAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [stabilityPoolAddress],
    })

    // Get signers for impersonated accounts (may be used in future tests)
    await ethers.getSigner(pcvAddress)
    await ethers.getSigner(stabilityPoolAddress)

    // Fund impersonated accounts for gas
    await deployer.sendTransaction({
      to: pcvAddress,
      value: ethers.parseEther("10"),
    })
    await deployer.sendTransaction({
      to: stabilityPoolAddress,
      value: ethers.parseEther("10"),
    })
  })

  describe("initialize", () => {
    it("should set the collateral token", async () => {
      expect(await borrowerOperations.collateralToken()).to.equal(
        await token.getAddress(),
      )
    })

    it("should set default minNetDebt", async () => {
      expect(await borrowerOperations.minNetDebt()).to.equal(
        ethers.parseEther("1800"),
      )
    })

    it("should set default borrowingRate", async () => {
      // 0.1% = 1e18 / 1000 = 1e15
      expect(await borrowerOperations.borrowingRate()).to.equal(
        ethers.parseEther("0.001"),
      )
    })

    it("should revert if initialized twice", async () => {
      await expect(
        borrowerOperations.initialize(await token.getAddress()),
      ).to.be.revertedWithCustomError(
        borrowerOperations,
        "InvalidInitialization",
      )
    })
  })

  describe("setAddresses", () => {
    it("should emit address changed events", async () => {
      const BorrowerOperationsERC20Factory = await ethers.getContractFactory(
        "BorrowerOperationsERC20",
      )
      const newBorrowerOps = (await upgrades.deployProxy(
        BorrowerOperationsERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as BorrowerOperationsERC20

      await expect(
        newBorrowerOps.setAddresses(
          await activePool.getAddress(),
          await collSurplusPool.getAddress(),
          await defaultPool.getAddress(),
          gasPoolAddress,
          governableVariablesAddress,
          await mockInterestRateManager.getAddress(),
          musdAddress,
          pcvAddress,
          await mockPriceFeed.getAddress(),
          sortedTrovesAddress,
          stabilityPoolAddress,
          await troveManager.getAddress(),
        ),
      )
        .to.emit(newBorrowerOps, "ActivePoolAddressChanged")
        .withArgs(await activePool.getAddress())
    })

    it("should revert if called by non-owner after renouncing", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .setAddresses(
            await activePool.getAddress(),
            await collSurplusPool.getAddress(),
            await defaultPool.getAddress(),
            gasPoolAddress,
            governableVariablesAddress,
            await mockInterestRateManager.getAddress(),
            musdAddress,
            pcvAddress,
            await mockPriceFeed.getAddress(),
            sortedTrovesAddress,
            stabilityPoolAddress,
            await troveManager.getAddress(),
          ),
      ).to.be.revertedWithCustomError(
        borrowerOperations,
        "OwnableUnauthorizedAccount",
      )
    })

    it("should revert if address is not a contract", async () => {
      const BorrowerOperationsERC20Factory = await ethers.getContractFactory(
        "BorrowerOperationsERC20",
      )
      const newBorrowerOps = (await upgrades.deployProxy(
        BorrowerOperationsERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as BorrowerOperationsERC20

      await expect(
        newBorrowerOps.setAddresses(
          alice.address, // EOA, not a contract
          await collSurplusPool.getAddress(),
          await defaultPool.getAddress(),
          gasPoolAddress,
          governableVariablesAddress,
          await mockInterestRateManager.getAddress(),
          musdAddress,
          pcvAddress,
          await mockPriceFeed.getAddress(),
          sortedTrovesAddress,
          stabilityPoolAddress,
          await troveManager.getAddress(),
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })
  })

  describe("mintBootstrapLoanFromPCV", () => {
    it("should revert if called by non-PCV address", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .mintBootstrapLoanFromPCV(ethers.parseEther("100")),
      ).to.be.revertedWith("BorrowerOps: Caller is not PCV")
    })

    // Note: Full test requires a mock MUSD with mint capability
  })

  describe("burnDebtFromPCV", () => {
    it("should revert if called by non-PCV address", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .burnDebtFromPCV(ethers.parseEther("100")),
      ).to.be.revertedWith("BorrowerOps: Caller is not PCV")
    })
  })

  describe("getBorrowingFee", () => {
    it("should calculate borrowing fee correctly", async () => {
      const debt = ethers.parseEther("10000") // 10,000 mUSD
      const fee = await borrowerOperations.getBorrowingFee(debt)

      // 0.1% of 10,000 = 10 mUSD
      expect(fee).to.equal(ethers.parseEther("10"))
    })

    it("should return 0 for 0 debt", async () => {
      const fee = await borrowerOperations.getBorrowingFee(0)
      expect(fee).to.equal(0)
    })
  })

  describe("view functions", () => {
    it("should return correct stabilityPoolAddress", async () => {
      expect(await borrowerOperations.stabilityPoolAddress()).to.equal(
        stabilityPoolAddress,
      )
    })

    it("should return correct collateralToken", async () => {
      expect(await borrowerOperations.collateralToken()).to.equal(
        await token.getAddress(),
      )
    })

    it("should return correct minNetDebt", async () => {
      expect(await borrowerOperations.minNetDebt()).to.equal(
        ethers.parseEther("1800"),
      )
    })
  })

  describe("getEntireSystemColl", () => {
    it("should return 0 when no collateral deposited", async () => {
      expect(await borrowerOperations.getEntireSystemColl()).to.equal(0)
    })
  })

  describe("getEntireSystemDebt", () => {
    it("should return 0 when no debt in system", async () => {
      expect(await borrowerOperations.getEntireSystemDebt()).to.equal(0)
    })
  })

  describe("claimCollateral", () => {
    it("should revert when no surplus collateral to claim", async () => {
      await expect(
        borrowerOperations.connect(alice).claimCollateral(),
      ).to.be.revertedWith("CollSurplusPool: No collateral available to claim")
    })
  })

  describe("adjustTrove parameter validation", () => {
    it("should revert when no adjustments are made", async () => {
      // The contract first checks for non-zero adjustment before checking trove status
      await expect(
        borrowerOperations.connect(alice).adjustTrove(
          0, // no deposit
          0, // no withdrawal
          0, // no debt change
          false,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWith(
        "BorrowerOps: There must be either a collateral change or a debt change",
      )
    })
  })

  describe("withdrawColl", () => {
    it("should revert when trove does not exist", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawColl(
            ethers.parseEther("1"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })
  })

  describe("withdrawMUSD", () => {
    it("should revert when trove does not exist", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawMUSD(
            ethers.parseEther("100"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })
  })

  describe("repayMUSD", () => {
    it("should revert when trove does not exist", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .repayMUSD(
            ethers.parseEther("100"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })
  })

  describe("closeTrove", () => {
    it("should revert when trove does not exist", async () => {
      // closeTrove checks status which reverts due to internal error on non-existent trove
      await expect(borrowerOperations.connect(alice).closeTrove()).to.be
        .reverted
    })
  })

  describe("addColl", () => {
    it("should revert when trove does not exist", async () => {
      await token.mint(alice.address, ethers.parseEther("10"))
      await token
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), ethers.parseEther("10"))

      await expect(
        borrowerOperations
          .connect(alice)
          .addColl(
            ethers.parseEther("1"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })
  })

  describe("moveCollateralGainToTrove", () => {
    it("should revert if caller is not StabilityPool", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .moveCollateralGainToTrove(
            alice.address,
            ethers.parseEther("1"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith("BorrowerOps: Caller is not Stability Pool")
    })
  })

  describe("openTrove parameter validation", () => {
    it("should revert when collateral amount is zero", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(
            0,
            ethers.parseEther("2000"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.revertedWith(
        "BorrowerOps: Collateral amount must be greater than 0",
      )
    })

    it("should revert when user has not approved collateral", async () => {
      await token.mint(alice.address, ethers.parseEther("10"))
      // No approval given

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(
            ethers.parseEther("1"),
            ethers.parseEther("2000"),
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ),
      ).to.be.reverted // Will fail on transferFrom
    })
  })
})
