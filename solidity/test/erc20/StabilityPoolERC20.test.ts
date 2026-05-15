import { expect } from "chai"
import { ethers, network, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  MockERC20,
  MockContract,
  MockPriceFeed,
  MockSortedTroves,
  MockTroveManager,
  StabilityPoolERC20,
} from "../../typechain"

describe("StabilityPoolERC20", () => {
  let collateralToken: MockERC20
  let musdToken: MockERC20
  let stabilityPool: StabilityPoolERC20

  // Mock contracts for address validation
  let mockActivePool: MockContract
  let mockBorrowerOperations: MockContract
  let mockPriceFeed: MockPriceFeed
  let mockSortedTroves: MockSortedTroves
  let mockTroveManager: MockTroveManager

  // Addresses
  let activePoolAddress: string
  let borrowerOperationsAddress: string
  let musdTokenAddress: string
  let priceFeedAddress: string
  let sortedTrovesAddress: string
  let troveManagerAddress: string

  // Signers
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let activePoolSigner: HardhatEthersSigner
  let troveManagerSigner: HardhatEthersSigner

  const DECIMAL_PRECISION = ethers.parseEther("1")
  const MCR = ethers.parseEther("1.1") // 110%

  beforeEach(async () => {
    ;[deployer, alice, bob] = await ethers.getSigners()

    // Deploy MockERC20 tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    collateralToken = await MockERC20Factory.deploy()
    musdToken = await MockERC20Factory.deploy()

    // Deploy mock contracts for checkContract validation
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockActivePool = await MockContractFactory.deploy()
    mockBorrowerOperations = await MockContractFactory.deploy()

    // Deploy functional mock contracts
    const MockPriceFeedFactory =
      await ethers.getContractFactory("MockPriceFeed")
    mockPriceFeed = await MockPriceFeedFactory.deploy()

    const MockSortedTrovesFactory =
      await ethers.getContractFactory("MockSortedTroves")
    mockSortedTroves = await MockSortedTrovesFactory.deploy()

    const MockTroveManagerFactory =
      await ethers.getContractFactory("MockTroveManager")
    mockTroveManager = await MockTroveManagerFactory.deploy()

    // Store addresses
    activePoolAddress = await mockActivePool.getAddress()
    borrowerOperationsAddress = await mockBorrowerOperations.getAddress()
    musdTokenAddress = await musdToken.getAddress()
    priceFeedAddress = await mockPriceFeed.getAddress()
    sortedTrovesAddress = await mockSortedTroves.getAddress()
    troveManagerAddress = await mockTroveManager.getAddress()

    // Set up mock sorted troves to return a valid trove address with high ICR
    await mockSortedTroves.setLast(alice.address)
    // Set a high ICR so withdrawals pass the check (must be >= MCR = 110%)
    await mockTroveManager.setICR(alice.address, ethers.parseEther("2")) // 200%

    // Deploy StabilityPoolERC20 as upgradeable proxy
    const StabilityPoolERC20Factory =
      await ethers.getContractFactory("StabilityPoolERC20")
    stabilityPool = (await upgrades.deployProxy(
      StabilityPoolERC20Factory,
      [await collateralToken.getAddress()],
      { initializer: "initialize" },
    )) as unknown as StabilityPoolERC20

    // Set addresses with deployed mock contracts
    await stabilityPool.setAddresses(
      activePoolAddress,
      borrowerOperationsAddress,
      musdTokenAddress,
      priceFeedAddress,
      sortedTrovesAddress,
      troveManagerAddress,
    )

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
      expect(await stabilityPool.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
    })

    it("should start with zero collateral balance", async () => {
      expect(await stabilityPool.getCollateralBalance()).to.equal(0)
    })

    it("should start with zero MUSD deposits", async () => {
      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(0)
    })

    it("should initialize P to DECIMAL_PRECISION", async () => {
      expect(await stabilityPool.P()).to.equal(DECIMAL_PRECISION)
    })

    it("should revert if initialized twice", async () => {
      await expect(
        stabilityPool.initialize(await collateralToken.getAddress()),
      ).to.be.revertedWithCustomError(stabilityPool, "InvalidInitialization")
    })

    it("should revert if collateral token is zero address", async () => {
      const StabilityPoolERC20Factory =
        await ethers.getContractFactory("StabilityPoolERC20")
      await expect(
        upgrades.deployProxy(StabilityPoolERC20Factory, [ethers.ZeroAddress], {
          initializer: "initialize",
        }),
      ).to.be.revertedWith("Invalid collateral token")
    })
  })

  describe("setAddresses", () => {
    it("should emit address changed events", async () => {
      const StabilityPoolERC20Factory =
        await ethers.getContractFactory("StabilityPoolERC20")
      const newPool = (await upgrades.deployProxy(
        StabilityPoolERC20Factory,
        [await collateralToken.getAddress()],
        { initializer: "initialize" },
      )) as unknown as StabilityPoolERC20

      await expect(
        newPool.setAddresses(
          activePoolAddress,
          borrowerOperationsAddress,
          musdTokenAddress,
          priceFeedAddress,
          sortedTrovesAddress,
          troveManagerAddress,
        ),
      )
        .to.emit(newPool, "ActivePoolAddressChanged")
        .withArgs(activePoolAddress)
    })

    it("should revert if called by non-owner after renouncing", async () => {
      await expect(
        stabilityPool
          .connect(alice)
          .setAddresses(
            activePoolAddress,
            borrowerOperationsAddress,
            musdTokenAddress,
            priceFeedAddress,
            sortedTrovesAddress,
            troveManagerAddress,
          ),
      ).to.be.revertedWithCustomError(
        stabilityPool,
        "OwnableUnauthorizedAccount",
      )
    })

    it("should revert if address is not a contract", async () => {
      const StabilityPoolERC20Factory =
        await ethers.getContractFactory("StabilityPoolERC20")
      const newPool = (await upgrades.deployProxy(
        StabilityPoolERC20Factory,
        [await collateralToken.getAddress()],
        { initializer: "initialize" },
      )) as unknown as StabilityPoolERC20

      await expect(
        newPool.setAddresses(
          bob.address, // EOA, not a contract
          borrowerOperationsAddress,
          musdTokenAddress,
          priceFeedAddress,
          sortedTrovesAddress,
          troveManagerAddress,
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })
  })

  describe("receiveCollateral", () => {
    const amount = ethers.parseEther("100")

    beforeEach(async () => {
      // Mint tokens and approve the stability pool
      await collateralToken.mint(activePoolAddress, amount)
      await collateralToken
        .connect(activePoolSigner)
        .approve(await stabilityPool.getAddress(), amount)
    })

    it("should pull tokens from caller", async () => {
      await stabilityPool.connect(activePoolSigner).receiveCollateral(amount)
      expect(
        await collateralToken.balanceOf(await stabilityPool.getAddress()),
      ).to.equal(amount)
    })

    it("should update collateral balance", async () => {
      await stabilityPool.connect(activePoolSigner).receiveCollateral(amount)
      expect(await stabilityPool.getCollateralBalance()).to.equal(amount)
    })

    it("should emit StabilityPoolCollateralBalanceUpdated event", async () => {
      await expect(
        stabilityPool.connect(activePoolSigner).receiveCollateral(amount),
      )
        .to.emit(stabilityPool, "StabilityPoolCollateralBalanceUpdated")
        .withArgs(amount)
    })

    it("should revert if called by unauthorized address", async () => {
      await collateralToken.mint(alice.address, amount)
      await collateralToken
        .connect(alice)
        .approve(await stabilityPool.getAddress(), amount)
      await expect(
        stabilityPool.connect(alice).receiveCollateral(amount),
      ).to.be.revertedWith("StabilityPool: Caller is not ActivePool")
    })

    it("should accumulate collateral on multiple receives", async () => {
      const firstAmount = ethers.parseEther("50")
      const secondAmount = ethers.parseEther("50")

      await stabilityPool
        .connect(activePoolSigner)
        .receiveCollateral(firstAmount)

      // Mint more and approve
      await collateralToken.mint(activePoolAddress, secondAmount)
      await collateralToken
        .connect(activePoolSigner)
        .approve(await stabilityPool.getAddress(), secondAmount)

      await stabilityPool
        .connect(activePoolSigner)
        .receiveCollateral(secondAmount)

      expect(await stabilityPool.getCollateralBalance()).to.equal(amount)
    })
  })

  describe("provideToSP", () => {
    const depositAmount = ethers.parseEther("1000")

    beforeEach(async () => {
      // Mint MUSD tokens to alice and approve the stability pool
      await musdToken.mint(alice.address, depositAmount)
      await musdToken
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
    })

    it("should revert if amount is zero", async () => {
      await expect(
        stabilityPool.connect(alice).provideToSP(0),
      ).to.be.revertedWith("StabilityPool: Amount must be non-zero")
    })

    it("should pull MUSD tokens from depositor", async () => {
      await stabilityPool.connect(alice).provideToSP(depositAmount)
      expect(
        await musdToken.balanceOf(await stabilityPool.getAddress()),
      ).to.equal(depositAmount)
    })

    it("should update total MUSD deposits", async () => {
      await stabilityPool.connect(alice).provideToSP(depositAmount)
      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(depositAmount)
    })

    it("should update user deposit", async () => {
      await stabilityPool.connect(alice).provideToSP(depositAmount)
      expect(await stabilityPool.deposits(alice.address)).to.equal(
        depositAmount,
      )
    })

    it("should emit UserDepositChanged event", async () => {
      await expect(stabilityPool.connect(alice).provideToSP(depositAmount))
        .to.emit(stabilityPool, "UserDepositChanged")
        .withArgs(alice.address, depositAmount)
    })

    it("should emit StabilityPoolMUSDBalanceUpdated event", async () => {
      await expect(stabilityPool.connect(alice).provideToSP(depositAmount))
        .to.emit(stabilityPool, "StabilityPoolMUSDBalanceUpdated")
        .withArgs(depositAmount)
    })

    it("should update deposit snapshots", async () => {
      await stabilityPool.connect(alice).provideToSP(depositAmount)

      const [, snapshotP, ,] = await stabilityPool.depositSnapshots(
        alice.address,
      )
      expect(snapshotP).to.equal(DECIMAL_PRECISION)
    })

    it("should allow multiple deposits from same user", async () => {
      const firstDeposit = ethers.parseEther("500")
      const secondDeposit = ethers.parseEther("500")

      await stabilityPool.connect(alice).provideToSP(firstDeposit)
      expect(await stabilityPool.deposits(alice.address)).to.equal(firstDeposit)

      // Approve more and deposit again
      await musdToken.mint(alice.address, secondDeposit)
      await musdToken
        .connect(alice)
        .approve(await stabilityPool.getAddress(), secondDeposit)

      await stabilityPool.connect(alice).provideToSP(secondDeposit)
      expect(await stabilityPool.deposits(alice.address)).to.equal(
        depositAmount,
      )
    })

    it("should allow deposits from multiple users", async () => {
      const aliceDeposit = ethers.parseEther("500")
      const bobDeposit = ethers.parseEther("300")

      // Alice deposits
      await stabilityPool.connect(alice).provideToSP(aliceDeposit)

      // Bob deposits
      await musdToken.mint(bob.address, bobDeposit)
      await musdToken
        .connect(bob)
        .approve(await stabilityPool.getAddress(), bobDeposit)
      await stabilityPool.connect(bob).provideToSP(bobDeposit)

      expect(await stabilityPool.deposits(alice.address)).to.equal(aliceDeposit)
      expect(await stabilityPool.deposits(bob.address)).to.equal(bobDeposit)
      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(
        aliceDeposit + bobDeposit,
      )
    })
  })

  describe("withdrawFromSP", () => {
    const depositAmount = ethers.parseEther("1000")
    const withdrawAmount = ethers.parseEther("500")

    beforeEach(async () => {
      // Mint MUSD tokens to alice, approve, and deposit
      await musdToken.mint(alice.address, depositAmount)
      await musdToken
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
      await stabilityPool.connect(alice).provideToSP(depositAmount)
    })

    it("should revert if user has no deposit", async () => {
      await expect(
        stabilityPool.connect(bob).withdrawFromSP(withdrawAmount),
      ).to.be.revertedWith("StabilityPool: User must have a non-zero deposit")
    })

    it("should transfer MUSD to depositor", async () => {
      const balanceBefore = await musdToken.balanceOf(alice.address)
      await stabilityPool.connect(alice).withdrawFromSP(withdrawAmount)
      const balanceAfter = await musdToken.balanceOf(alice.address)
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount)
    })

    it("should update total MUSD deposits", async () => {
      await stabilityPool.connect(alice).withdrawFromSP(withdrawAmount)
      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(
        depositAmount - withdrawAmount,
      )
    })

    it("should update user deposit", async () => {
      await stabilityPool.connect(alice).withdrawFromSP(withdrawAmount)
      expect(await stabilityPool.deposits(alice.address)).to.equal(
        depositAmount - withdrawAmount,
      )
    })

    it("should emit UserDepositChanged event", async () => {
      await expect(stabilityPool.connect(alice).withdrawFromSP(withdrawAmount))
        .to.emit(stabilityPool, "UserDepositChanged")
        .withArgs(alice.address, depositAmount - withdrawAmount)
    })

    it("should emit StabilityPoolMUSDBalanceUpdated event", async () => {
      await expect(stabilityPool.connect(alice).withdrawFromSP(withdrawAmount))
        .to.emit(stabilityPool, "StabilityPoolMUSDBalanceUpdated")
        .withArgs(depositAmount - withdrawAmount)
    })

    it("should allow full withdrawal", async () => {
      await stabilityPool.connect(alice).withdrawFromSP(depositAmount)
      expect(await stabilityPool.deposits(alice.address)).to.equal(0)
      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(0)
    })

    it("should withdraw only compounded amount if requested more than available", async () => {
      const excessAmount = ethers.parseEther("2000")

      const balanceBefore = await musdToken.balanceOf(alice.address)
      await stabilityPool.connect(alice).withdrawFromSP(excessAmount)
      const balanceAfter = await musdToken.balanceOf(alice.address)

      // Should only receive the deposited amount, not the excess
      expect(balanceAfter - balanceBefore).to.equal(depositAmount)
      expect(await stabilityPool.deposits(alice.address)).to.equal(0)
    })

    it("should delete snapshots when withdrawing all", async () => {
      await stabilityPool.connect(alice).withdrawFromSP(depositAmount)

      const [snapshotS, snapshotP, snapshotScale, snapshotEpoch] =
        await stabilityPool.depositSnapshots(alice.address)

      expect(snapshotS).to.equal(0)
      expect(snapshotP).to.equal(0)
      expect(snapshotScale).to.equal(0)
      expect(snapshotEpoch).to.equal(0)
    })

    it("should allow zero withdrawal to claim collateral gains only", async () => {
      // Zero withdrawal should work regardless of undercollateralized troves
      await mockTroveManager.setICR(alice.address, MCR / 2n) // Set low ICR

      // Should still succeed for zero withdrawal
      await expect(stabilityPool.connect(alice).withdrawFromSP(0)).to.not.be
        .reverted
    })

    it("should revert non-zero withdrawal if there are undercollateralized troves", async () => {
      // Set the lowest trove to have ICR below MCR
      await mockTroveManager.setICR(alice.address, MCR - 1n)

      await expect(
        stabilityPool.connect(alice).withdrawFromSP(withdrawAmount),
      ).to.be.revertedWith(
        "StabilityPool: Cannot withdraw while there are troves with ICR < MCR",
      )
    })
  })

  describe("getCompoundedMUSDDeposit", () => {
    const depositAmount = ethers.parseEther("1000")

    beforeEach(async () => {
      await musdToken.mint(alice.address, depositAmount)
      await musdToken
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
      await stabilityPool.connect(alice).provideToSP(depositAmount)
    })

    it("should return zero for address with no deposit", async () => {
      expect(
        await stabilityPool.getCompoundedMUSDDeposit(bob.address),
      ).to.equal(0)
    })

    it("should return deposited amount when no liquidations occurred", async () => {
      expect(
        await stabilityPool.getCompoundedMUSDDeposit(alice.address),
      ).to.equal(depositAmount)
    })
  })

  describe("getDepositorCollateralGain", () => {
    it("should return zero for address with no deposit", async () => {
      expect(
        await stabilityPool.getDepositorCollateralGain(bob.address),
      ).to.equal(0)
    })

    it("should return zero when no liquidations occurred", async () => {
      const depositAmount = ethers.parseEther("1000")
      await musdToken.mint(alice.address, depositAmount)
      await musdToken
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
      await stabilityPool.connect(alice).provideToSP(depositAmount)

      expect(
        await stabilityPool.getDepositorCollateralGain(alice.address),
      ).to.equal(0)
    })
  })

  describe("offset", () => {
    const depositAmount = ethers.parseEther("10000")
    const principalToOffset = ethers.parseEther("5000")
    const interestToOffset = ethers.parseEther("500")
    const collToAdd = ethers.parseEther("10")

    it("should revert if caller is not TroveManager", async () => {
      await expect(
        stabilityPool
          .connect(alice)
          .offset(principalToOffset, interestToOffset, collToAdd),
      ).to.be.revertedWith("StabilityPool: Caller is not TroveManager")
    })

    it("should do nothing if total deposits is zero", async () => {
      // No deposits made, so offset should do nothing
      await expect(
        stabilityPool
          .connect(troveManagerSigner)
          .offset(principalToOffset, interestToOffset, collToAdd),
      ).to.not.be.reverted

      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(0)
    })

    it("should do nothing if debt to offset is zero", async () => {
      // Make a deposit first
      await musdToken.mint(alice.address, depositAmount)
      await musdToken
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
      await stabilityPool.connect(alice).provideToSP(depositAmount)

      await expect(
        stabilityPool.connect(troveManagerSigner).offset(0, 0, collToAdd),
      ).to.not.be.reverted

      // Deposits should remain unchanged
      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(depositAmount)
    })
  })

  describe("epochToScaleToSum", () => {
    it("should start at zero", async () => {
      expect(await stabilityPool.epochToScaleToSum(0, 0)).to.equal(0)
    })
  })

  describe("P, currentScale, currentEpoch", () => {
    it("should initialize P to DECIMAL_PRECISION", async () => {
      expect(await stabilityPool.P()).to.equal(DECIMAL_PRECISION)
    })

    it("should initialize currentScale to 0", async () => {
      expect(await stabilityPool.currentScale()).to.equal(0)
    })

    it("should initialize currentEpoch to 0", async () => {
      expect(await stabilityPool.currentEpoch()).to.equal(0)
    })
  })

  describe("error trackers", () => {
    it("should initialize lastCollateralError_Offset to 0", async () => {
      expect(await stabilityPool.lastCollateralError_Offset()).to.equal(0)
    })

    it("should initialize lastMUSDLossError_Offset to 0", async () => {
      expect(await stabilityPool.lastMUSDLossError_Offset()).to.equal(0)
    })
  })
})
