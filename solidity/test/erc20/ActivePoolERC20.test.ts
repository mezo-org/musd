import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import type {
  ActivePoolERC20,
  MockERC20,
  MockContract,
} from "../../typechain-types"

describe("ActivePoolERC20", () => {
  let activePool: ActivePoolERC20
  let mockToken: MockERC20
  let mockBorrowerOps: MockContract
  let mockTroveManager: MockContract
  let mockDefaultPool: MockContract
  let mockStabilityPool: MockContract
  let mockCollSurplusPool: MockContract
  let mockInterestRateManager: MockContract
  let owner: HardhatEthersSigner
  let borrowerOps: HardhatEthersSigner
  let troveManager: HardhatEthersSigner
  let defaultPool: HardhatEthersSigner
  let stabilityPool: HardhatEthersSigner
  let user: HardhatEthersSigner

  const initialBalance = ethers.parseEther("1000000")

  beforeEach(async () => {
    ;[
      owner,
      borrowerOps,
      troveManager,
      defaultPool,
      stabilityPool,
      user,
    ] = await ethers.getSigners()

    // Deploy mock ERC20 token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    mockToken = await MockERC20Factory.deploy("Mock Token", "MTK", 18)

    // Deploy mock contracts
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockBorrowerOps = await MockContractFactory.deploy()
    mockTroveManager = await MockContractFactory.deploy()
    mockDefaultPool = await MockContractFactory.deploy()
    mockStabilityPool = await MockContractFactory.deploy()
    mockCollSurplusPool = await MockContractFactory.deploy()
    mockInterestRateManager = await MockContractFactory.deploy()

    // Deploy ActivePoolERC20
    const ActivePoolERC20Factory = await ethers.getContractFactory(
      "ActivePoolERC20"
    )
    activePool = (await upgrades.deployProxy(ActivePoolERC20Factory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as ActivePoolERC20

    // Set addresses
    await activePool.setAddresses(
      await mockToken.getAddress(),
      await mockBorrowerOps.getAddress(),
      await mockCollSurplusPool.getAddress(),
      await mockDefaultPool.getAddress(),
      await mockInterestRateManager.getAddress(),
      await mockStabilityPool.getAddress(),
      await mockTroveManager.getAddress()
    )

    // Mint tokens to user
    await mockToken.mint(user.address, initialBalance)
  })

  describe("initialization", () => {
    it("should set collateral token correctly", async () => {
      expect(await activePool.collateralToken()).to.equal(
        await mockToken.getAddress()
      )
    })

    it("should set borrower operations address correctly", async () => {
      expect(await activePool.borrowerOperationsAddress()).to.equal(
        await mockBorrowerOps.getAddress()
      )
    })

    it("should set trove manager address correctly", async () => {
      expect(await activePool.troveManagerAddress()).to.equal(
        await mockTroveManager.getAddress()
      )
    })

    it("should initialize with zero balances", async () => {
      expect(await activePool.getCollateralBalance()).to.equal(0)
      expect(await activePool.getPrincipal()).to.equal(0)
      expect(await activePool.getInterest()).to.equal(0)
    })

    it("should reject zero address for collateral token", async () => {
      const ActivePoolERC20Factory = await ethers.getContractFactory(
        "ActivePoolERC20"
      )
      const newActivePool = (await upgrades.deployProxy(
        ActivePoolERC20Factory,
        [],
        {
          kind: "transparent",
          unsafeSkipStorageCheck: true,
        }
      )) as unknown as ActivePoolERC20

      await expect(
        newActivePool.setAddresses(
          ethers.ZeroAddress,
          await mockBorrowerOps.getAddress(),
          await mockCollSurplusPool.getAddress(),
          await mockDefaultPool.getAddress(),
          await mockInterestRateManager.getAddress(),
          await mockStabilityPool.getAddress(),
          await mockTroveManager.getAddress()
        )
      ).to.be.revertedWith(
        "ActivePoolERC20: Collateral token cannot be zero address"
      )
    })
  })

  describe("receiveCollateral", () => {
    const depositAmount = ethers.parseEther("100")

    it("should allow borrower operations to deposit collateral", async () => {
      // User transfers tokens to mockBorrowerOps contract
      await mockToken
        .connect(user)
        .transfer(await mockBorrowerOps.getAddress(), depositAmount)

      // Transfer tokens from mockBorrowerOps to ActivePool
      await mockToken
        .connect(user)
        .transfer(await activePool.getAddress(), depositAmount)

      // BorrowerOps calls receiveCollateral to track the deposit
      // Impersonate the mockBorrowerOps contract
      await ethers.provider.send("hardhat_setBalance", [
        await mockBorrowerOps.getAddress(),
        "0x1000000000000000000",
      ])
      await ethers.provider.send("hardhat_impersonateAccount", [
        await mockBorrowerOps.getAddress(),
      ])
      const mockBorrowerOpsSigner = await ethers.getSigner(
        await mockBorrowerOps.getAddress()
      )

      await expect(
        activePool.connect(mockBorrowerOpsSigner).receiveCollateral(depositAmount)
      )
        .to.emit(activePool, "ActivePoolCollateralBalanceUpdated")
        .withArgs(depositAmount)

      expect(await activePool.getCollateralBalance()).to.equal(depositAmount)
      expect(await mockToken.balanceOf(await activePool.getAddress())).to.equal(
        depositAmount
      )

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [
        await mockBorrowerOps.getAddress(),
      ])
    })

    it("should allow default pool to deposit collateral", async () => {
      // User transfers tokens to defaultPool
      await mockToken.connect(user).transfer(defaultPool.address, depositAmount)

      // DefaultPool transfers to ActivePool
      await mockToken
        .connect(defaultPool)
        .transfer(await activePool.getAddress(), depositAmount)

      // DefaultPool calls receiveCollateral to track the deposit
      await activePool.connect(defaultPool).receiveCollateral(depositAmount)

      expect(await activePool.getCollateralBalance()).to.equal(depositAmount)
    })

    it("should reject deposits from unauthorized addresses", async () => {
      await mockToken
        .connect(user)
        .transfer(await activePool.getAddress(), depositAmount)

      await expect(
        activePool.connect(user).receiveCollateral(depositAmount)
      ).to.be.revertedWith(
        "ActivePoolERC20: Caller is neither BorrowerOperations nor Default Pool"
      )
    })
  })

  describe("sendCollateral", () => {
    const depositAmount = ethers.parseEther("100")
    const sendAmount = ethers.parseEther("50")

    beforeEach(async () => {
      // Setup: deposit some collateral first
      await mockToken.connect(user).transfer(borrowerOps.address, depositAmount)
      await mockToken
        .connect(borrowerOps)
        .transfer(await activePool.getAddress(), depositAmount)
      await activePool.connect(borrowerOps).receiveCollateral(depositAmount)
    })

    it("should allow borrower operations to send collateral", async () => {
      await expect(
        activePool.connect(borrowerOps).sendCollateral(user.address, sendAmount)
      )
        .to.emit(activePool, "CollateralSent")
        .withArgs(user.address, sendAmount)
        .and.to.emit(activePool, "ActivePoolCollateralBalanceUpdated")
        .withArgs(depositAmount - sendAmount)

      expect(await activePool.getCollateralBalance()).to.equal(
        depositAmount - sendAmount
      )
      expect(await mockToken.balanceOf(user.address)).to.equal(
        initialBalance - depositAmount + sendAmount
      )
    })

    it("should allow trove manager to send collateral", async () => {
      await activePool.connect(troveManager).sendCollateral(user.address, sendAmount)

      expect(await activePool.getCollateralBalance()).to.equal(
        depositAmount - sendAmount
      )
    })

    it("should allow stability pool to send collateral", async () => {
      await activePool
        .connect(stabilityPool)
        .sendCollateral(user.address, sendAmount)

      expect(await activePool.getCollateralBalance()).to.equal(
        depositAmount - sendAmount
      )
    })

    it("should reject sends from unauthorized addresses", async () => {
      await expect(
        activePool.connect(user).sendCollateral(user.address, sendAmount)
      ).to.be.revertedWith(
        "ActivePoolERC20: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
      )
    })
  })

  describe("debt management", () => {
    const principal = ethers.parseEther("1000")
    const interest = ethers.parseEther("50")

    describe("increaseDebt", () => {
      it("should allow borrower operations to increase debt", async () => {
        await expect(
          activePool.connect(borrowerOps).increaseDebt(principal, interest)
        )
          .to.emit(activePool, "ActivePoolDebtUpdated")
          .withArgs(principal, interest)

        expect(await activePool.getPrincipal()).to.equal(principal)
        expect(await activePool.getInterest()).to.equal(interest)
        expect(await activePool.getDebt()).to.equal(principal + interest)
      })

      it("should allow trove manager to increase debt", async () => {
        await activePool.connect(troveManager).increaseDebt(principal, interest)

        expect(await activePool.getPrincipal()).to.equal(principal)
        expect(await activePool.getInterest()).to.equal(interest)
      })

      it("should reject increases from unauthorized addresses", async () => {
        await expect(
          activePool.connect(user).increaseDebt(principal, interest)
        ).to.be.revertedWith(
          "ActivePoolERC20: Caller must be BorrowerOperations, TroveManager, or InterestRateManager"
        )
      })
    })

    describe("decreaseDebt", () => {
      beforeEach(async () => {
        await activePool.connect(borrowerOps).increaseDebt(principal, interest)
      })

      it("should allow borrower operations to decrease debt", async () => {
        const decreaseAmount = ethers.parseEther("500")
        const decreaseInterest = ethers.parseEther("25")

        await activePool
          .connect(borrowerOps)
          .decreaseDebt(decreaseAmount, decreaseInterest)

        expect(await activePool.getPrincipal()).to.equal(
          principal - decreaseAmount
        )
        expect(await activePool.getInterest()).to.equal(
          interest - decreaseInterest
        )
      })

      it("should allow stability pool to decrease debt", async () => {
        await activePool
          .connect(stabilityPool)
          .decreaseDebt(principal, interest)

        expect(await activePool.getPrincipal()).to.equal(0)
        expect(await activePool.getInterest()).to.equal(0)
      })

      it("should reject decreases from unauthorized addresses", async () => {
        await expect(
          activePool.connect(user).decreaseDebt(principal, interest)
        ).to.be.revertedWith(
          "ActivePoolERC20: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool"
        )
      })
    })
  })
})
