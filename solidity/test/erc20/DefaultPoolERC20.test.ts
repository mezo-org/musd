import { expect } from "chai"
import { ethers, network, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { MockERC20, MockContract, DefaultPoolERC20 } from "../../typechain"

describe("DefaultPoolERC20", () => {
  let token: MockERC20
  let defaultPool: DefaultPoolERC20

  // Mock contracts for address validation
  let mockActivePool: MockContract
  let mockTroveManager: MockContract

  // Addresses
  let activePoolAddress: string
  let troveManagerAddress: string

  // Signers
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let activePoolSigner: HardhatEthersSigner
  let troveManagerSigner: HardhatEthersSigner

  beforeEach(async () => {
    ;[deployer, alice] = await ethers.getSigners()

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()

    // Deploy mock contracts for checkContract validation
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockActivePool = await MockContractFactory.deploy()
    mockTroveManager = await MockContractFactory.deploy()

    // Store addresses
    activePoolAddress = await mockActivePool.getAddress()
    troveManagerAddress = await mockTroveManager.getAddress()

    // Deploy DefaultPoolERC20 as upgradeable proxy
    const DefaultPoolERC20Factory =
      await ethers.getContractFactory("DefaultPoolERC20")
    defaultPool = (await upgrades.deployProxy(
      DefaultPoolERC20Factory,
      [await token.getAddress()],
      { initializer: "initialize" },
    )) as unknown as DefaultPoolERC20

    // Set addresses with deployed mock contracts
    await defaultPool.setAddresses(activePoolAddress, troveManagerAddress)

    // Impersonate mock contract addresses for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [activePoolAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [troveManagerAddress],
    })

    // Get signers for impersonated accounts
    activePoolSigner = await ethers.getSigner(activePoolAddress)
    troveManagerSigner = await ethers.getSigner(troveManagerAddress)

    // Fund impersonated accounts for gas
    await deployer.sendTransaction({
      to: activePoolAddress,
      value: ethers.parseEther("1"),
    })
    await deployer.sendTransaction({
      to: troveManagerAddress,
      value: ethers.parseEther("1"),
    })
  })

  describe("initialize", () => {
    it("should set the collateral token", async () => {
      expect(await defaultPool.collateralToken()).to.equal(
        await token.getAddress(),
      )
    })

    it("should start with zero collateral balance", async () => {
      expect(await defaultPool.getCollateralBalance()).to.equal(0)
    })

    it("should start with zero debt", async () => {
      expect(await defaultPool.getDebt()).to.equal(0)
    })

    it("should revert if initialized twice", async () => {
      await expect(
        defaultPool.initialize(await token.getAddress()),
      ).to.be.revertedWithCustomError(defaultPool, "InvalidInitialization")
    })
  })

  describe("setAddresses", () => {
    it("should emit address changed events", async () => {
      const DefaultPoolERC20Factory =
        await ethers.getContractFactory("DefaultPoolERC20")
      const newPool = (await upgrades.deployProxy(
        DefaultPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as DefaultPoolERC20

      await expect(newPool.setAddresses(activePoolAddress, troveManagerAddress))
        .to.emit(newPool, "ActivePoolAddressChanged")
        .withArgs(activePoolAddress)
    })

    it("should emit TroveManagerAddressChanged event", async () => {
      const DefaultPoolERC20Factory =
        await ethers.getContractFactory("DefaultPoolERC20")
      const newPool = (await upgrades.deployProxy(
        DefaultPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as DefaultPoolERC20

      await expect(newPool.setAddresses(activePoolAddress, troveManagerAddress))
        .to.emit(newPool, "TroveManagerAddressChanged")
        .withArgs(troveManagerAddress)
    })

    it("should revert if called by non-owner after renouncing", async () => {
      await expect(
        defaultPool
          .connect(alice)
          .setAddresses(activePoolAddress, troveManagerAddress),
      ).to.be.revertedWithCustomError(defaultPool, "OwnableUnauthorizedAccount")
    })

    it("should revert if address is not a contract", async () => {
      const DefaultPoolERC20Factory =
        await ethers.getContractFactory("DefaultPoolERC20")
      const newPool = (await upgrades.deployProxy(
        DefaultPoolERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as DefaultPoolERC20

      await expect(
        newPool.setAddresses(
          alice.address, // EOA, not a contract
          troveManagerAddress,
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })
  })

  describe("receiveCollateral", () => {
    const amount = ethers.parseEther("100")

    beforeEach(async () => {
      // Mint tokens and approve the default pool
      await token.mint(activePoolAddress, amount)
      await token
        .connect(activePoolSigner)
        .approve(await defaultPool.getAddress(), amount)
    })

    it("should pull tokens from caller", async () => {
      await defaultPool.connect(activePoolSigner).receiveCollateral(amount)
      expect(await token.balanceOf(await defaultPool.getAddress())).to.equal(
        amount,
      )
    })

    it("should update collateral balance", async () => {
      await defaultPool.connect(activePoolSigner).receiveCollateral(amount)
      expect(await defaultPool.getCollateralBalance()).to.equal(amount)
    })

    it("should emit CollateralReceived event", async () => {
      await expect(
        defaultPool.connect(activePoolSigner).receiveCollateral(amount),
      )
        .to.emit(defaultPool, "CollateralReceived")
        .withArgs(activePoolAddress, amount)
    })

    it("should emit DefaultPoolCollateralBalanceUpdated event", async () => {
      await expect(
        defaultPool.connect(activePoolSigner).receiveCollateral(amount),
      )
        .to.emit(defaultPool, "DefaultPoolCollateralBalanceUpdated")
        .withArgs(amount)
    })

    it("should revert if called by unauthorized address", async () => {
      await token.mint(alice.address, amount)
      await token.connect(alice).approve(await defaultPool.getAddress(), amount)
      await expect(
        defaultPool.connect(alice).receiveCollateral(amount),
      ).to.be.revertedWith("DefaultPool: Caller is not the ActivePool")
    })
  })

  describe("sendCollateralToActivePool", () => {
    const amount = ethers.parseEther("100")

    beforeEach(async () => {
      // First receive some collateral
      await token.mint(activePoolAddress, amount)
      await token
        .connect(activePoolSigner)
        .approve(await defaultPool.getAddress(), amount)
      await defaultPool.connect(activePoolSigner).receiveCollateral(amount)
    })

    it("should approve ActivePool to pull tokens", async () => {
      await defaultPool
        .connect(troveManagerSigner)
        .sendCollateralToActivePool(amount)
      // After the send, the tokens should have been approved for ActivePool
      // Since MockContract doesn't have receiveCollateral, the allowance remains
      expect(
        await token.allowance(
          await defaultPool.getAddress(),
          activePoolAddress,
        ),
      ).to.equal(amount)
    })

    it("should update collateral balance", async () => {
      await defaultPool
        .connect(troveManagerSigner)
        .sendCollateralToActivePool(amount)
      expect(await defaultPool.getCollateralBalance()).to.equal(0)
    })

    it("should emit DefaultPoolCollateralBalanceUpdated event", async () => {
      await expect(
        defaultPool
          .connect(troveManagerSigner)
          .sendCollateralToActivePool(amount),
      )
        .to.emit(defaultPool, "DefaultPoolCollateralBalanceUpdated")
        .withArgs(0)
    })

    it("should emit CollateralSent event", async () => {
      await expect(
        defaultPool
          .connect(troveManagerSigner)
          .sendCollateralToActivePool(amount),
      )
        .to.emit(defaultPool, "CollateralSent")
        .withArgs(activePoolAddress, amount)
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        defaultPool.connect(alice).sendCollateralToActivePool(amount),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })

    it("should revert if called by ActivePool", async () => {
      await expect(
        defaultPool
          .connect(activePoolSigner)
          .sendCollateralToActivePool(amount),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })
  })

  describe("increaseDebt", () => {
    it("should increase principal and interest", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await defaultPool
        .connect(troveManagerSigner)
        .increaseDebt(principal, interest)

      expect(await defaultPool.getPrincipal()).to.equal(principal)
      expect(await defaultPool.getInterest()).to.equal(interest)
      expect(await defaultPool.getDebt()).to.equal(principal + interest)
    })

    it("should emit DefaultPoolDebtUpdated event", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await expect(
        defaultPool
          .connect(troveManagerSigner)
          .increaseDebt(principal, interest),
      )
        .to.emit(defaultPool, "DefaultPoolDebtUpdated")
        .withArgs(principal, interest)
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        defaultPool
          .connect(alice)
          .increaseDebt(ethers.parseEther("1000"), ethers.parseEther("50")),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })

    it("should revert if called by ActivePool", async () => {
      await expect(
        defaultPool
          .connect(activePoolSigner)
          .increaseDebt(ethers.parseEther("1000"), ethers.parseEther("50")),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })
  })

  describe("decreaseDebt", () => {
    beforeEach(async () => {
      // First increase debt
      await defaultPool
        .connect(troveManagerSigner)
        .increaseDebt(ethers.parseEther("1000"), ethers.parseEther("50"))
    })

    it("should decrease principal and interest", async () => {
      const principal = ethers.parseEther("500")
      const interest = ethers.parseEther("25")

      await defaultPool
        .connect(troveManagerSigner)
        .decreaseDebt(principal, interest)

      expect(await defaultPool.getPrincipal()).to.equal(
        ethers.parseEther("500"),
      )
      expect(await defaultPool.getInterest()).to.equal(ethers.parseEther("25"))
    })

    it("should emit DefaultPoolDebtUpdated event", async () => {
      const principal = ethers.parseEther("500")
      const interest = ethers.parseEther("25")

      await expect(
        defaultPool
          .connect(troveManagerSigner)
          .decreaseDebt(principal, interest),
      )
        .to.emit(defaultPool, "DefaultPoolDebtUpdated")
        .withArgs(ethers.parseEther("500"), ethers.parseEther("25"))
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        defaultPool
          .connect(alice)
          .decreaseDebt(ethers.parseEther("500"), ethers.parseEther("25")),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })

    it("should revert if called by ActivePool", async () => {
      await expect(
        defaultPool
          .connect(activePoolSigner)
          .decreaseDebt(ethers.parseEther("500"), ethers.parseEther("25")),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })
  })

  describe("getters", () => {
    it("should return correct total debt", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await defaultPool
        .connect(troveManagerSigner)
        .increaseDebt(principal, interest)

      expect(await defaultPool.getDebt()).to.equal(principal + interest)
    })

    it("should return correct principal", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await defaultPool
        .connect(troveManagerSigner)
        .increaseDebt(principal, interest)

      expect(await defaultPool.getPrincipal()).to.equal(principal)
    })

    it("should return correct interest", async () => {
      const principal = ethers.parseEther("1000")
      const interest = ethers.parseEther("50")

      await defaultPool
        .connect(troveManagerSigner)
        .increaseDebt(principal, interest)

      expect(await defaultPool.getInterest()).to.equal(interest)
    })
  })
})
