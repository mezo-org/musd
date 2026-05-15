import { expect } from "chai"
import { ethers, network, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { MockERC20, MockContract, CollSurplusPoolERC20 } from "../../typechain"

describe("CollSurplusPoolERC20", () => {
  let token: MockERC20
  let collSurplusPool: CollSurplusPoolERC20

  // Mock contracts for address validation
  let mockActivePool: MockContract
  let mockBorrowerOperations: MockContract
  let mockTroveManager: MockContract

  // Addresses
  let activePoolAddress: string
  let borrowerOperationsAddress: string
  let troveManagerAddress: string

  // Signers
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let activePoolSigner: HardhatEthersSigner
  let borrowerOperationsSigner: HardhatEthersSigner
  let troveManagerSigner: HardhatEthersSigner

  beforeEach(async () => {
    ;[deployer, alice, bob] = await ethers.getSigners()

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()

    // Deploy mock contracts for checkContract validation
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockActivePool = await MockContractFactory.deploy()
    mockBorrowerOperations = await MockContractFactory.deploy()
    mockTroveManager = await MockContractFactory.deploy()

    // Store addresses
    activePoolAddress = await mockActivePool.getAddress()
    borrowerOperationsAddress = await mockBorrowerOperations.getAddress()
    troveManagerAddress = await mockTroveManager.getAddress()

    // Deploy CollSurplusPoolERC20 as upgradeable proxy
    const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
      "CollSurplusPoolERC20",
    )
    collSurplusPool = (await upgrades.deployProxy(
      CollSurplusPoolERC20Factory,
      [await token.getAddress()],
      { initializer: "initialize" },
    )) as unknown as CollSurplusPoolERC20

    // Set addresses with deployed mock contracts
    await collSurplusPool.setAddresses(
      activePoolAddress,
      borrowerOperationsAddress,
      troveManagerAddress,
    )

    // Impersonate mock contract addresses for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [activePoolAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [borrowerOperationsAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [troveManagerAddress],
    })

    // Get signers for impersonated accounts
    activePoolSigner = await ethers.getSigner(activePoolAddress)
    borrowerOperationsSigner = await ethers.getSigner(borrowerOperationsAddress)
    troveManagerSigner = await ethers.getSigner(troveManagerAddress)

    // Fund impersonated accounts for gas
    await deployer.sendTransaction({
      to: activePoolAddress,
      value: ethers.parseEther("1"),
    })
    await deployer.sendTransaction({
      to: borrowerOperationsAddress,
      value: ethers.parseEther("1"),
    })
    await deployer.sendTransaction({
      to: troveManagerAddress,
      value: ethers.parseEther("1"),
    })
  })

  describe("initialize", () => {
    it("should set the collateral token", async () => {
      expect(await collSurplusPool.collateralToken()).to.equal(
        await token.getAddress(),
      )
    })

    it("should start with zero collateral balance", async () => {
      expect(await collSurplusPool.getCollateralBalance()).to.equal(0)
    })

    it("should revert if initialized twice", async () => {
      await expect(
        collSurplusPool.initialize(await token.getAddress()),
      ).to.be.revertedWithCustomError(collSurplusPool, "InvalidInitialization")
    })
  })

  describe("setAddresses", () => {
    it("should emit ActivePoolAddressChanged event", async () => {
      const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
        "CollSurplusPoolERC20",
      )
      const newPool = (await upgrades.deployProxy(
        CollSurplusPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as CollSurplusPoolERC20

      await expect(
        newPool.setAddresses(
          activePoolAddress,
          borrowerOperationsAddress,
          troveManagerAddress,
        ),
      )
        .to.emit(newPool, "ActivePoolAddressChanged")
        .withArgs(activePoolAddress)
    })

    it("should emit BorrowerOperationsAddressChanged event", async () => {
      const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
        "CollSurplusPoolERC20",
      )
      const newPool = (await upgrades.deployProxy(
        CollSurplusPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as CollSurplusPoolERC20

      await expect(
        newPool.setAddresses(
          activePoolAddress,
          borrowerOperationsAddress,
          troveManagerAddress,
        ),
      )
        .to.emit(newPool, "BorrowerOperationsAddressChanged")
        .withArgs(borrowerOperationsAddress)
    })

    it("should emit TroveManagerAddressChanged event", async () => {
      const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
        "CollSurplusPoolERC20",
      )
      const newPool = (await upgrades.deployProxy(
        CollSurplusPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as CollSurplusPoolERC20

      await expect(
        newPool.setAddresses(
          activePoolAddress,
          borrowerOperationsAddress,
          troveManagerAddress,
        ),
      )
        .to.emit(newPool, "TroveManagerAddressChanged")
        .withArgs(troveManagerAddress)
    })

    it("should revert if called by non-owner after renouncing", async () => {
      await expect(
        collSurplusPool
          .connect(alice)
          .setAddresses(
            activePoolAddress,
            borrowerOperationsAddress,
            troveManagerAddress,
          ),
      ).to.be.revertedWithCustomError(
        collSurplusPool,
        "OwnableUnauthorizedAccount",
      )
    })

    it("should revert if activePool address is not a contract", async () => {
      const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
        "CollSurplusPoolERC20",
      )
      const newPool = (await upgrades.deployProxy(
        CollSurplusPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as CollSurplusPoolERC20

      await expect(
        newPool.setAddresses(
          alice.address, // EOA, not a contract
          borrowerOperationsAddress,
          troveManagerAddress,
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })

    it("should revert if borrowerOperations address is not a contract", async () => {
      const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
        "CollSurplusPoolERC20",
      )
      const newPool = (await upgrades.deployProxy(
        CollSurplusPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as CollSurplusPoolERC20

      await expect(
        newPool.setAddresses(
          activePoolAddress,
          alice.address, // EOA, not a contract
          troveManagerAddress,
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })

    it("should revert if troveManager address is not a contract", async () => {
      const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
        "CollSurplusPoolERC20",
      )
      const newPool = (await upgrades.deployProxy(
        CollSurplusPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as CollSurplusPoolERC20

      await expect(
        newPool.setAddresses(
          activePoolAddress,
          borrowerOperationsAddress,
          alice.address, // EOA, not a contract
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })
  })

  describe("receiveCollateral", () => {
    const amount = ethers.parseEther("100")

    beforeEach(async () => {
      // Mint tokens to ActivePool and approve the CollSurplusPool
      await token.mint(activePoolAddress, amount)
      await token
        .connect(activePoolSigner)
        .approve(await collSurplusPool.getAddress(), amount)
    })

    it("should pull tokens from caller", async () => {
      await collSurplusPool.connect(activePoolSigner).receiveCollateral(amount)
      expect(
        await token.balanceOf(await collSurplusPool.getAddress()),
      ).to.equal(amount)
    })

    it("should update collateral balance", async () => {
      await collSurplusPool.connect(activePoolSigner).receiveCollateral(amount)
      expect(await collSurplusPool.getCollateralBalance()).to.equal(amount)
    })

    it("should emit CollateralReceived event", async () => {
      await expect(
        collSurplusPool.connect(activePoolSigner).receiveCollateral(amount),
      )
        .to.emit(collSurplusPool, "CollateralReceived")
        .withArgs(activePoolAddress, amount)
    })

    it("should revert if called by unauthorized address", async () => {
      await token.mint(alice.address, amount)
      await token
        .connect(alice)
        .approve(await collSurplusPool.getAddress(), amount)
      await expect(
        collSurplusPool.connect(alice).receiveCollateral(amount),
      ).to.be.revertedWith("CollSurplusPool: Caller is not Active Pool")
    })

    it("should revert if called by BorrowerOperations", async () => {
      await token.mint(borrowerOperationsAddress, amount)
      await token
        .connect(borrowerOperationsSigner)
        .approve(await collSurplusPool.getAddress(), amount)
      await expect(
        collSurplusPool
          .connect(borrowerOperationsSigner)
          .receiveCollateral(amount),
      ).to.be.revertedWith("CollSurplusPool: Caller is not Active Pool")
    })

    it("should revert if called by TroveManager", async () => {
      await token.mint(troveManagerAddress, amount)
      await token
        .connect(troveManagerSigner)
        .approve(await collSurplusPool.getAddress(), amount)
      await expect(
        collSurplusPool.connect(troveManagerSigner).receiveCollateral(amount),
      ).to.be.revertedWith("CollSurplusPool: Caller is not Active Pool")
    })
  })

  describe("accountSurplus", () => {
    const surplusAmount = ethers.parseEther("50")

    it("should record surplus for an account", async () => {
      await collSurplusPool
        .connect(troveManagerSigner)
        .accountSurplus(alice.address, surplusAmount)
      expect(await collSurplusPool.getCollateral(alice.address)).to.equal(
        surplusAmount,
      )
    })

    it("should accumulate surplus for the same account", async () => {
      await collSurplusPool
        .connect(troveManagerSigner)
        .accountSurplus(alice.address, surplusAmount)
      await collSurplusPool
        .connect(troveManagerSigner)
        .accountSurplus(alice.address, surplusAmount)
      expect(await collSurplusPool.getCollateral(alice.address)).to.equal(
        surplusAmount * 2n,
      )
    })

    it("should emit CollBalanceUpdated event", async () => {
      await expect(
        collSurplusPool
          .connect(troveManagerSigner)
          .accountSurplus(alice.address, surplusAmount),
      )
        .to.emit(collSurplusPool, "CollBalanceUpdated")
        .withArgs(alice.address, surplusAmount)
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        collSurplusPool
          .connect(alice)
          .accountSurplus(alice.address, surplusAmount),
      ).to.be.revertedWith("CollSurplusPool: Caller is not TroveManager")
    })

    it("should revert if called by BorrowerOperations", async () => {
      await expect(
        collSurplusPool
          .connect(borrowerOperationsSigner)
          .accountSurplus(alice.address, surplusAmount),
      ).to.be.revertedWith("CollSurplusPool: Caller is not TroveManager")
    })

    it("should revert if called by ActivePool", async () => {
      await expect(
        collSurplusPool
          .connect(activePoolSigner)
          .accountSurplus(alice.address, surplusAmount),
      ).to.be.revertedWith("CollSurplusPool: Caller is not TroveManager")
    })
  })

  describe("claimColl", () => {
    const collateralAmount = ethers.parseEther("100")
    const surplusAmount = ethers.parseEther("50")

    beforeEach(async () => {
      // First, receive collateral from ActivePool
      await token.mint(activePoolAddress, collateralAmount)
      await token
        .connect(activePoolSigner)
        .approve(await collSurplusPool.getAddress(), collateralAmount)
      await collSurplusPool
        .connect(activePoolSigner)
        .receiveCollateral(collateralAmount)

      // Then, record surplus for Alice via TroveManager
      await collSurplusPool
        .connect(troveManagerSigner)
        .accountSurplus(alice.address, surplusAmount)
    })

    it("should transfer collateral to recipient", async () => {
      await collSurplusPool
        .connect(borrowerOperationsSigner)
        .claimColl(alice.address, bob.address)
      expect(await token.balanceOf(bob.address)).to.equal(surplusAmount)
    })

    it("should clear the account balance after claiming", async () => {
      await collSurplusPool
        .connect(borrowerOperationsSigner)
        .claimColl(alice.address, alice.address)
      expect(await collSurplusPool.getCollateral(alice.address)).to.equal(0)
    })

    it("should update total collateral balance", async () => {
      const initialBalance = await collSurplusPool.getCollateralBalance()
      await collSurplusPool
        .connect(borrowerOperationsSigner)
        .claimColl(alice.address, alice.address)
      expect(await collSurplusPool.getCollateralBalance()).to.equal(
        initialBalance - surplusAmount,
      )
    })

    it("should emit CollBalanceUpdated event with zero", async () => {
      await expect(
        collSurplusPool
          .connect(borrowerOperationsSigner)
          .claimColl(alice.address, alice.address),
      )
        .to.emit(collSurplusPool, "CollBalanceUpdated")
        .withArgs(alice.address, 0)
    })

    it("should emit CollateralSent event", async () => {
      await expect(
        collSurplusPool
          .connect(borrowerOperationsSigner)
          .claimColl(alice.address, bob.address),
      )
        .to.emit(collSurplusPool, "CollateralSent")
        .withArgs(bob.address, surplusAmount)
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        collSurplusPool.connect(alice).claimColl(alice.address, alice.address),
      ).to.be.revertedWith("CollSurplusPool: Caller is not Borrower Operations")
    })

    it("should revert if called by TroveManager", async () => {
      await expect(
        collSurplusPool
          .connect(troveManagerSigner)
          .claimColl(alice.address, alice.address),
      ).to.be.revertedWith("CollSurplusPool: Caller is not Borrower Operations")
    })

    it("should revert if called by ActivePool", async () => {
      await expect(
        collSurplusPool
          .connect(activePoolSigner)
          .claimColl(alice.address, alice.address),
      ).to.be.revertedWith("CollSurplusPool: Caller is not Borrower Operations")
    })

    it("should revert if no collateral to claim", async () => {
      await expect(
        collSurplusPool
          .connect(borrowerOperationsSigner)
          .claimColl(bob.address, bob.address),
      ).to.be.revertedWith("CollSurplusPool: No collateral available to claim")
    })

    it("should revert if claiming after already claimed", async () => {
      // First claim succeeds
      await collSurplusPool
        .connect(borrowerOperationsSigner)
        .claimColl(alice.address, alice.address)

      // Second claim fails
      await expect(
        collSurplusPool
          .connect(borrowerOperationsSigner)
          .claimColl(alice.address, alice.address),
      ).to.be.revertedWith("CollSurplusPool: No collateral available to claim")
    })
  })

  describe("getCollateral", () => {
    it("should return zero for accounts with no surplus", async () => {
      expect(await collSurplusPool.getCollateral(alice.address)).to.equal(0)
    })

    it("should return correct balance after accountSurplus", async () => {
      const surplusAmount = ethers.parseEther("25")
      await collSurplusPool
        .connect(troveManagerSigner)
        .accountSurplus(alice.address, surplusAmount)
      expect(await collSurplusPool.getCollateral(alice.address)).to.equal(
        surplusAmount,
      )
    })
  })

  describe("getCollateralBalance", () => {
    it("should return zero when no collateral received", async () => {
      expect(await collSurplusPool.getCollateralBalance()).to.equal(0)
    })

    it("should return correct total after receiving collateral", async () => {
      const amount = ethers.parseEther("100")
      await token.mint(activePoolAddress, amount)
      await token
        .connect(activePoolSigner)
        .approve(await collSurplusPool.getAddress(), amount)
      await collSurplusPool.connect(activePoolSigner).receiveCollateral(amount)

      expect(await collSurplusPool.getCollateralBalance()).to.equal(amount)
    })

    it("should return correct total after multiple receives", async () => {
      const amount1 = ethers.parseEther("50")
      const amount2 = ethers.parseEther("75")

      // First receive
      await token.mint(activePoolAddress, amount1)
      await token
        .connect(activePoolSigner)
        .approve(await collSurplusPool.getAddress(), amount1)
      await collSurplusPool.connect(activePoolSigner).receiveCollateral(amount1)

      // Second receive
      await token.mint(activePoolAddress, amount2)
      await token
        .connect(activePoolSigner)
        .approve(await collSurplusPool.getAddress(), amount2)
      await collSurplusPool.connect(activePoolSigner).receiveCollateral(amount2)

      expect(await collSurplusPool.getCollateralBalance()).to.equal(
        amount1 + amount2,
      )
    })
  })

  describe("NAME constant", () => {
    it("should return the correct name", async () => {
      expect(await collSurplusPool.NAME()).to.equal("CollSurplusPoolERC20")
    })
  })
})
