import { expect } from "chai"
import { ethers, network, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  MockERC20,
  MockContract,
  MockInterestRateManager,
  ActivePoolERC20,
} from "../../typechain"

describe("ActivePoolERC20", () => {
  let token: MockERC20
  let activePool: ActivePoolERC20
  let mockInterestRateManager: MockInterestRateManager

  // Mock contracts for address validation
  let mockBorrowerOperations: MockContract
  let mockTroveManager: MockContract
  let mockStabilityPool: MockContract
  let mockDefaultPool: MockContract
  let mockCollSurplusPool: MockContract

  // Addresses
  let borrowerOperationsAddress: string
  let troveManagerAddress: string
  let stabilityPoolAddress: string
  let defaultPoolAddress: string
  let collSurplusPoolAddress: string
  let interestRateManagerAddress: string

  // Signers
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let borrowerOperationsSigner: HardhatEthersSigner
  let troveManagerSigner: HardhatEthersSigner
  let stabilityPoolSigner: HardhatEthersSigner
  let defaultPoolSigner: HardhatEthersSigner
  let interestRateManagerSigner: HardhatEthersSigner

  beforeEach(async () => {
    const signers = await ethers.getSigners()
    deployer = signers[0]
    alice = signers[1]

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()

    // Deploy mock contracts for checkContract validation
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockBorrowerOperations = await MockContractFactory.deploy()
    mockTroveManager = await MockContractFactory.deploy()
    mockStabilityPool = await MockContractFactory.deploy()
    mockDefaultPool = await MockContractFactory.deploy()
    mockCollSurplusPool = await MockContractFactory.deploy()

    // Deploy MockInterestRateManager
    const MockInterestRateManagerFactory = await ethers.getContractFactory(
      "MockInterestRateManager",
    )
    mockInterestRateManager = await MockInterestRateManagerFactory.deploy()

    // Store addresses
    borrowerOperationsAddress = await mockBorrowerOperations.getAddress()
    troveManagerAddress = await mockTroveManager.getAddress()
    stabilityPoolAddress = await mockStabilityPool.getAddress()
    defaultPoolAddress = await mockDefaultPool.getAddress()
    collSurplusPoolAddress = await mockCollSurplusPool.getAddress()
    interestRateManagerAddress = await mockInterestRateManager.getAddress()

    // Deploy ActivePoolERC20 as upgradeable proxy
    const ActivePoolERC20Factory =
      await ethers.getContractFactory("ActivePoolERC20")
    activePool = (await upgrades.deployProxy(
      ActivePoolERC20Factory,
      [await token.getAddress()],
      { initializer: "initialize" },
    )) as unknown as ActivePoolERC20

    // Set addresses with deployed mock contracts
    await activePool.setAddresses(
      borrowerOperationsAddress,
      collSurplusPoolAddress,
      defaultPoolAddress,
      interestRateManagerAddress,
      stabilityPoolAddress,
      troveManagerAddress,
    )

    // Impersonate mock contract addresses for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [borrowerOperationsAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [troveManagerAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [stabilityPoolAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [defaultPoolAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [interestRateManagerAddress],
    })

    // Get signers for impersonated accounts
    borrowerOperationsSigner = await ethers.getSigner(borrowerOperationsAddress)
    troveManagerSigner = await ethers.getSigner(troveManagerAddress)
    stabilityPoolSigner = await ethers.getSigner(stabilityPoolAddress)
    defaultPoolSigner = await ethers.getSigner(defaultPoolAddress)
    interestRateManagerSigner = await ethers.getSigner(interestRateManagerAddress)

    // Fund impersonated accounts for gas
    await deployer.sendTransaction({
      to: borrowerOperationsAddress,
      value: ethers.parseEther("1"),
    })
    await deployer.sendTransaction({
      to: troveManagerAddress,
      value: ethers.parseEther("1"),
    })
    await deployer.sendTransaction({
      to: stabilityPoolAddress,
      value: ethers.parseEther("1"),
    })
    await deployer.sendTransaction({
      to: defaultPoolAddress,
      value: ethers.parseEther("1"),
    })
    await deployer.sendTransaction({
      to: interestRateManagerAddress,
      value: ethers.parseEther("1"),
    })
  })

  describe("initialize", () => {
    it("should set the collateral token", async () => {
      expect(await activePool.collateralToken()).to.equal(
        await token.getAddress(),
      )
    })

    it("should start with zero collateral balance", async () => {
      expect(await activePool.getCollateralBalance()).to.equal(0)
    })

    it("should start with zero debt", async () => {
      expect(await activePool.getDebt()).to.equal(0)
    })

    it("should revert if initialized twice", async () => {
      await expect(
        activePool.initialize(await token.getAddress()),
      ).to.be.revertedWithCustomError(activePool, "InvalidInitialization")
    })
  })

  describe("setAddresses", () => {
    it("should emit address changed events", async () => {
      const ActivePoolERC20Factory =
        await ethers.getContractFactory("ActivePoolERC20")
      const newPool = (await upgrades.deployProxy(
        ActivePoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as ActivePoolERC20

      await expect(
        newPool.setAddresses(
          borrowerOperationsAddress,
          collSurplusPoolAddress,
          defaultPoolAddress,
          interestRateManagerAddress,
          stabilityPoolAddress,
          troveManagerAddress,
        ),
      )
        .to.emit(newPool, "BorrowerOperationsAddressChanged")
        .withArgs(borrowerOperationsAddress)
    })

    it("should revert if called by non-owner after renouncing", async () => {
      await expect(
        activePool
          .connect(alice)
          .setAddresses(
            borrowerOperationsAddress,
            collSurplusPoolAddress,
            defaultPoolAddress,
            interestRateManagerAddress,
            stabilityPoolAddress,
            troveManagerAddress,
          ),
      ).to.be.revertedWithCustomError(activePool, "OwnableUnauthorizedAccount")
    })

    it("should revert if address is not a contract", async () => {
      const ActivePoolERC20Factory =
        await ethers.getContractFactory("ActivePoolERC20")
      const newPool = (await upgrades.deployProxy(
        ActivePoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as ActivePoolERC20

      await expect(
        newPool.setAddresses(
          alice.address, // EOA, not a contract
          collSurplusPoolAddress,
          defaultPoolAddress,
          interestRateManagerAddress,
          stabilityPoolAddress,
          troveManagerAddress,
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })
  })

  describe("receiveCollateral", () => {
    const amount = ethers.parseEther("100")

    beforeEach(async () => {
      // Mint tokens and approve the active pool
      await token.mint(borrowerOperationsAddress, amount)
      await token
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount)
    })

    it("should pull tokens from caller", async () => {
      await activePool.connect(borrowerOperationsSigner).receiveCollateral(amount)
      expect(await token.balanceOf(await activePool.getAddress())).to.equal(
        amount,
      )
    })

    it("should update collateral balance", async () => {
      await activePool.connect(borrowerOperationsSigner).receiveCollateral(amount)
      expect(await activePool.getCollateralBalance()).to.equal(amount)
    })

    it("should emit CollateralReceived event", async () => {
      await expect(
        activePool.connect(borrowerOperationsSigner).receiveCollateral(amount),
      )
        .to.emit(activePool, "CollateralReceived")
        .withArgs(borrowerOperationsAddress, amount)
    })

    it("should emit ActivePoolCollateralBalanceUpdated event", async () => {
      await expect(
        activePool.connect(borrowerOperationsSigner).receiveCollateral(amount),
      )
        .to.emit(activePool, "ActivePoolCollateralBalanceUpdated")
        .withArgs(amount)
    })

    it("should revert if called by unauthorized address", async () => {
      await token.mint(alice.address, amount)
      await token.connect(alice).approve(await activePool.getAddress(), amount)
      await expect(
        activePool.connect(alice).receiveCollateral(amount),
      ).to.be.revertedWith(
        "ActivePool: Caller is neither BorrowerOperations nor Default Pool",
      )
    })

    it("should allow DefaultPool to call", async () => {
      await token.mint(defaultPoolAddress, amount)
      await token
        .connect(defaultPoolSigner)
        .approve(await activePool.getAddress(), amount)
      await expect(activePool.connect(defaultPoolSigner).receiveCollateral(amount))
        .to.emit(activePool, "CollateralReceived")
        .withArgs(defaultPoolAddress, amount)
    })
  })

  describe("sendCollateral", () => {
    const amount = ethers.parseEther("100")

    beforeEach(async () => {
      // First receive some collateral
      await token.mint(borrowerOperationsAddress, amount)
      await token
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount)
      await activePool.connect(borrowerOperationsSigner).receiveCollateral(amount)
    })

    it("should transfer tokens to recipient", async () => {
      await activePool
        .connect(borrowerOperationsSigner)
        .sendCollateral(alice.address, amount)
      expect(await token.balanceOf(alice.address)).to.equal(amount)
    })

    it("should update collateral balance", async () => {
      await activePool
        .connect(borrowerOperationsSigner)
        .sendCollateral(alice.address, amount)
      expect(await activePool.getCollateralBalance()).to.equal(0)
    })

    it("should emit CollateralSent event", async () => {
      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .sendCollateral(alice.address, amount),
      )
        .to.emit(activePool, "CollateralSent")
        .withArgs(alice.address, amount)
    })

    it("should emit ActivePoolCollateralBalanceUpdated event", async () => {
      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .sendCollateral(alice.address, amount),
      )
        .to.emit(activePool, "ActivePoolCollateralBalanceUpdated")
        .withArgs(0)
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        activePool.connect(alice).sendCollateral(alice.address, amount),
      ).to.be.revertedWith(
        "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool",
      )
    })

    it("should allow TroveManager to call", async () => {
      await expect(
        activePool.connect(troveManagerSigner).sendCollateral(alice.address, amount),
      )
        .to.emit(activePool, "CollateralSent")
        .withArgs(alice.address, amount)
    })

    it("should allow StabilityPool to call", async () => {
      await expect(
        activePool.connect(stabilityPoolSigner).sendCollateral(alice.address, amount),
      )
        .to.emit(activePool, "CollateralSent")
        .withArgs(alice.address, amount)
    })
  })

  describe("increaseDebt", () => {
    it("should increase principal and interest", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(principal, interest)

      expect(await activePool.getPrincipal()).to.equal(principal)
      // getInterest() now includes accrued interest from interestRateManager (which is 0 in mock)
      expect(await activePool.getInterest()).to.equal(interest)
      expect(await activePool.getDebt()).to.equal(principal + interest)
    })

    it("should emit ActivePoolDebtUpdated event", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .increaseDebt(principal, interest),
      )
        .to.emit(activePool, "ActivePoolDebtUpdated")
        .withArgs(principal, interest)
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        activePool
          .connect(alice)
          .increaseDebt(ethers.parseEther("1000"), ethers.parseEther("50")),
      ).to.be.revertedWith(
        "ActivePool: Caller must be BorrowerOperations, TroveManager, or InterestRateManager",
      )
    })

    it("should allow TroveManager to call", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await expect(
        activePool.connect(troveManagerSigner).increaseDebt(principal, interest),
      ).to.emit(activePool, "ActivePoolDebtUpdated")
    })

    it("should allow InterestRateManager to call", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await expect(
        activePool
          .connect(interestRateManagerSigner)
          .increaseDebt(principal, interest),
      ).to.emit(activePool, "ActivePoolDebtUpdated")
    })
  })

  describe("decreaseDebt", () => {
    beforeEach(async () => {
      // First increase debt
      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(ethers.parseEther("1000"), ethers.parseEther("50"))
    })

    it("should decrease principal and interest", async () => {
      const principal = ethers.parseEther("500")
      const interest = ethers.parseEther("25")

      await activePool
        .connect(borrowerOperationsSigner)
        .decreaseDebt(principal, interest)

      expect(await activePool.getPrincipal()).to.equal(ethers.parseEther("500"))
      expect(await activePool.getInterest()).to.equal(ethers.parseEther("25"))
    })

    it("should emit ActivePoolDebtUpdated event", async () => {
      const principal = ethers.parseEther("500")
      const interest = ethers.parseEther("25")

      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .decreaseDebt(principal, interest),
      )
        .to.emit(activePool, "ActivePoolDebtUpdated")
        .withArgs(ethers.parseEther("500"), ethers.parseEther("25"))
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        activePool
          .connect(alice)
          .decreaseDebt(ethers.parseEther("500"), ethers.parseEther("25")),
      ).to.be.revertedWith(
        "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool",
      )
    })

    it("should allow TroveManager to call", async () => {
      await expect(
        activePool
          .connect(troveManagerSigner)
          .decreaseDebt(ethers.parseEther("500"), ethers.parseEther("25")),
      ).to.emit(activePool, "ActivePoolDebtUpdated")
    })

    it("should allow StabilityPool to call", async () => {
      await expect(
        activePool
          .connect(stabilityPoolSigner)
          .decreaseDebt(ethers.parseEther("500"), ethers.parseEther("25")),
      ).to.emit(activePool, "ActivePoolDebtUpdated")
    })
  })

  describe("getInterest with accrued interest", () => {
    it("should include accrued interest from interest rate manager", async () => {
      const storedInterest = ethers.parseEther("50")
      const accruedInterest = ethers.parseEther("10")

      // Set up some stored interest
      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(ethers.parseEther("1000"), storedInterest)

      // Set accrued interest in the mock
      await mockInterestRateManager.setAccruedInterest(accruedInterest)

      // getInterest should return stored interest + accrued interest
      expect(await activePool.getInterest()).to.equal(storedInterest + accruedInterest)
    })

    it("should include accrued interest in getDebt", async () => {
      const principal = ethers.parseEther("1000")
      const storedInterest = ethers.parseEther("50")
      const accruedInterest = ethers.parseEther("10")

      // Set up some debt
      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(principal, storedInterest)

      // Set accrued interest in the mock
      await mockInterestRateManager.setAccruedInterest(accruedInterest)

      // getDebt should include principal + stored interest + accrued interest
      expect(await activePool.getDebt()).to.equal(principal + storedInterest + accruedInterest)
    })
  })
})
