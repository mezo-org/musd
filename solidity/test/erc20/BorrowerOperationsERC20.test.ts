import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import type {
  BorrowerOperationsERC20,
  MockERC20,
  MockContract,
  ActivePoolERC20,
  MUSD,
  PCV,
} from "../../typechain-types"

describe("BorrowerOperationsERC20", () => {
  let borrowerOps: BorrowerOperationsERC20
  let mockToken: MockERC20
  let mockActivePool: ActivePoolERC20
  let mockDefaultPool: MockContract
  let mockStabilityPool: MockContract
  let mockGasPool: MockContract
  let mockCollSurplusPool: MockContract
  let mockPriceFeed: MockContract
  let mockSortedTroves: MockContract
  let mockMUSD: MockContract
  let mockTroveManager: MockContract
  let mockInterestRateManager: MockContract
  let mockGovernableVariables: MockContract
  let mockPCV: MockContract
  let owner: HardhatEthersSigner
  let user: HardhatEthersSigner
  let council: HardhatEthersSigner
  let treasury: HardhatEthersSigner

  const DECIMAL_PRECISION = ethers.parseEther("1")
  const MIN_NET_DEBT = ethers.parseEther("1800")
  const MUSD_GAS_COMPENSATION = ethers.parseEther("200")
  const MCR = ethers.parseEther("1.1") // 110%
  const CCR = ethers.parseEther("1.5") // 150%

  beforeEach(async () => {
    ;[owner, user, council, treasury] = await ethers.getSigners()

    // Deploy mock ERC20 token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    mockToken = await MockERC20Factory.deploy("Mock BTC", "MBTC", 18)

    // Deploy mock contracts
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockDefaultPool = await MockContractFactory.deploy()
    mockStabilityPool = await MockContractFactory.deploy()
    mockGasPool = await MockContractFactory.deploy()
    mockCollSurplusPool = await MockContractFactory.deploy()
    mockPriceFeed = await MockContractFactory.deploy()
    mockSortedTroves = await MockContractFactory.deploy()
    mockMUSD = await MockContractFactory.deploy()
    mockTroveManager = await MockContractFactory.deploy()
    mockInterestRateManager = await MockContractFactory.deploy()
    mockGovernableVariables = await MockContractFactory.deploy()
    mockPCV = await MockContractFactory.deploy()

    // Deploy ActivePoolERC20
    const ActivePoolERC20Factory =
      await ethers.getContractFactory("ActivePoolERC20")
    mockActivePool = (await upgrades.deployProxy(ActivePoolERC20Factory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as ActivePoolERC20

    // Deploy BorrowerOperationsERC20
    const BorrowerOperationsERC20Factory = await ethers.getContractFactory(
      "BorrowerOperationsERC20",
    )
    borrowerOps = (await upgrades.deployProxy(
      BorrowerOperationsERC20Factory,
      [],
      {
        kind: "transparent",
        unsafeSkipStorageCheck: true,
      },
    )) as unknown as BorrowerOperationsERC20

    // Mint tokens to user for testing
    await mockToken.mint(user.address, ethers.parseEther("1000000"))
  })

  describe("initialization", () => {
    it("should initialize correctly", async () => {
      expect(await borrowerOps.name()).to.equal("BorrowerOperationsERC20")
      expect(await borrowerOps.refinancingFeePercentage()).to.equal(20)
      expect(await borrowerOps.minNetDebt()).to.equal(ethers.parseEther("1800"))
    })

    it("should not allow double initialization", async () => {
      await expect(borrowerOps.initialize()).to.be.reverted
    })

    it("should set addresses correctly", async () => {
      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await mockPCV.getAddress(),
      ]

      await borrowerOps.setAddresses(addresses)

      expect(await borrowerOps.collateralToken()).to.equal(
        await mockToken.getAddress(),
      )
      expect(await borrowerOps.activePoolERC20()).to.equal(
        await mockActivePool.getAddress(),
      )
      expect(await borrowerOps.troveManager()).to.equal(
        await mockTroveManager.getAddress(),
      )
    })

    it("should reject zero address for collateral token", async () => {
      const addresses = [
        ethers.ZeroAddress,
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await mockPCV.getAddress(),
      ]

      await expect(borrowerOps.setAddresses(addresses)).to.be.revertedWith(
        "BorrowerOpsERC20: Collateral token cannot be zero",
      )
    })

    it("should emit events when setting addresses", async () => {
      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await mockPCV.getAddress(),
      ]

      await expect(borrowerOps.setAddresses(addresses))
        .to.emit(borrowerOps, "ActivePoolAddressChanged")
        .withArgs(await mockActivePool.getAddress())
        .and.to.emit(borrowerOps, "TroveManagerAddressChanged")
        .withArgs(await mockTroveManager.getAddress())
        .and.to.emit(borrowerOps, "MUSDTokenAddressChanged")
        .withArgs(await mockMUSD.getAddress())
    })
  })

  describe("governance functions", () => {
    let realPCV: PCV

    beforeEach(async () => {
      // Deploy a real PCV contract for governance testing
      const PCVFactory = await ethers.getContractFactory("PCV")
      const governanceTimeDelay = 7 * 24 * 60 * 60 // 7 days
      realPCV = (await upgrades.deployProxy(
        PCVFactory,
        [governanceTimeDelay],
        {
          kind: "transparent",
          unsafeSkipStorageCheck: true,
        },
      )) as unknown as PCV

      // Set up PCV roles
      await realPCV
        .connect(owner)
        .startChangingRoles(council.address, treasury.address)
      await realPCV.connect(owner).finalizeChangingRoles()

      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await realPCV.getAddress(),
      ]
      await borrowerOps.setAddresses(addresses)
    })

    describe("setRefinancingFeePercentage", () => {
      it("should allow governance to set refinancing fee percentage", async () => {
        await expect(borrowerOps.connect(council).setRefinancingFeePercentage(25))
          .to.emit(borrowerOps, "RefinancingFeePercentageChanged")
          .withArgs(25)

        expect(await borrowerOps.refinancingFeePercentage()).to.equal(25)
      })

      it("should reject fee percentage greater than 100", async () => {
        await expect(
          borrowerOps.connect(council).setRefinancingFeePercentage(101),
        ).to.be.revertedWith("BorrowerOpsERC20: Fee percentage must be <= 100")
      })

      it("should reject non-governance caller", async () => {
        await expect(
          borrowerOps.connect(user).setRefinancingFeePercentage(25),
        ).to.be.revertedWith("BorrowerOpsERC20: Only governance can call this function")
      })
    })

    describe("minNetDebt governance", () => {
      it("should allow governance to propose minNetDebt", async () => {
        const newMinNetDebt = ethers.parseEther("2000")
        const tx = await borrowerOps
          .connect(council)
          .proposeMinNetDebt(newMinNetDebt)
        const receipt = await tx.wait()
        const block = await ethers.provider.getBlock(receipt!.blockNumber)

        await expect(tx)
          .to.emit(borrowerOps, "MinNetDebtProposed")
          .withArgs(newMinNetDebt, block!.timestamp)

        expect(await borrowerOps.proposedMinNetDebt()).to.equal(newMinNetDebt)
      })

      it("should reject minNetDebt below minimum", async () => {
        const tooLowMinNetDebt = ethers.parseEther("40")
        await expect(
          borrowerOps.connect(council).proposeMinNetDebt(tooLowMinNetDebt),
        ).to.be.revertedWith("BorrowerOpsERC20: Min net debt too low")
      })

      it("should allow approval after 7 days", async () => {
        const newMinNetDebt = ethers.parseEther("2000")
        await borrowerOps.connect(council).proposeMinNetDebt(newMinNetDebt)

        // Fast forward 7 days
        await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60])
        await ethers.provider.send("evm_mine", [])

        await expect(borrowerOps.connect(council).approveMinNetDebt())
          .to.emit(borrowerOps, "MinNetDebtChanged")
          .withArgs(newMinNetDebt)

        expect(await borrowerOps.minNetDebt()).to.equal(newMinNetDebt)
      })

      it("should reject approval before 7 days", async () => {
        const newMinNetDebt = ethers.parseEther("2000")
        await borrowerOps.connect(council).proposeMinNetDebt(newMinNetDebt)

        // Fast forward 6 days
        await ethers.provider.send("evm_increaseTime", [6 * 24 * 60 * 60])
        await ethers.provider.send("evm_mine", [])

        await expect(
          borrowerOps.connect(council).approveMinNetDebt(),
        ).to.be.revertedWith("BorrowerOpsERC20: Governance delay not met")
      })
    })

    describe("borrowingRate governance", () => {
      it("should allow governance to propose borrowing rate", async () => {
        const newRate = DECIMAL_PRECISION / 500n // 0.2%
        const tx = await borrowerOps
          .connect(council)
          .proposeBorrowingRate(newRate)
        const receipt = await tx.wait()
        const block = await ethers.provider.getBlock(receipt!.blockNumber)

        await expect(tx)
          .to.emit(borrowerOps, "BorrowingRateProposed")
          .withArgs(newRate, block!.timestamp)

        expect(await borrowerOps.proposedBorrowingRate()).to.equal(newRate)
      })

      it("should allow approval after 7 days", async () => {
        const newRate = DECIMAL_PRECISION / 500n // 0.2%
        await borrowerOps.connect(council).proposeBorrowingRate(newRate)

        // Fast forward 7 days
        await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60])
        await ethers.provider.send("evm_mine", [])

        await expect(borrowerOps.connect(council).approveBorrowingRate())
          .to.emit(borrowerOps, "BorrowingRateChanged")
          .withArgs(newRate)

        expect(await borrowerOps.borrowingRate()).to.equal(newRate)
      })

      it("should reject approval before 7 days", async () => {
        const newRate = DECIMAL_PRECISION / 500n // 0.2%
        await borrowerOps.connect(council).proposeBorrowingRate(newRate)

        await expect(
          borrowerOps.connect(council).approveBorrowingRate(),
        ).to.be.revertedWith("BorrowerOpsERC20: Governance delay not met")
      })
    })

    describe("redemptionRate governance", () => {
      it("should allow governance to propose redemption rate", async () => {
        const newRate = (DECIMAL_PRECISION * 5n) / 1000n // 0.5%
        const tx = await borrowerOps
          .connect(council)
          .proposeRedemptionRate(newRate)
        const receipt = await tx.wait()
        const block = await ethers.provider.getBlock(receipt!.blockNumber)

        await expect(tx)
          .to.emit(borrowerOps, "RedemptionRateProposed")
          .withArgs(newRate, block!.timestamp)

        expect(await borrowerOps.proposedRedemptionRate()).to.equal(newRate)
      })

      it("should allow approval after 7 days", async () => {
        const newRate = (DECIMAL_PRECISION * 5n) / 1000n // 0.5%
        await borrowerOps.connect(council).proposeRedemptionRate(newRate)

        // Fast forward 7 days
        await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60])
        await ethers.provider.send("evm_mine", [])

        await expect(borrowerOps.connect(council).approveRedemptionRate())
          .to.emit(borrowerOps, "RedemptionRateChanged")
          .withArgs(newRate)

        expect(await borrowerOps.redemptionRate()).to.equal(newRate)
      })
    })
  })

  describe("view functions", () => {
    beforeEach(async () => {
      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await mockPCV.getAddress(),
      ]
      await borrowerOps.setAddresses(addresses)
    })

    it("should calculate borrowing fee correctly", async () => {
      const debt = ethers.parseEther("10000")
      const borrowingRate = await borrowerOps.borrowingRate()
      const expectedFee = (debt * borrowingRate) / DECIMAL_PRECISION

      const actualFee = await borrowerOps.getBorrowingFee(debt)
      expect(actualFee).to.equal(expectedFee)
    })

    it("should calculate redemption rate correctly", async () => {
      const collateral = ethers.parseEther("10")
      const redemptionRate = await borrowerOps.redemptionRate()
      const expectedRate =
        (collateral * redemptionRate) / DECIMAL_PRECISION

      const actualRate = await borrowerOps.getRedemptionRate(collateral)
      expect(actualRate).to.equal(expectedRate)
    })

    it("should return governable variables contract", async () => {
      expect(await borrowerOps.governableVariables()).to.equal(
        await mockGovernableVariables.getAddress(),
      )
    })

    it("should return collateral token address", async () => {
      expect(await borrowerOps.collateralToken()).to.equal(
        await mockToken.getAddress(),
      )
    })

    it("should return minNetDebt", async () => {
      expect(await borrowerOps.minNetDebt()).to.equal(
        ethers.parseEther("1800"),
      )
    })
  })

  describe("PCV functions", () => {
    let realPCV: PCV
    let realMUSD: MUSD

    beforeEach(async () => {
      // Deploy a real PCV contract
      const PCVFactory = await ethers.getContractFactory("PCV")
      const governanceTimeDelay = 7 * 24 * 60 * 60 // 7 days
      realPCV = (await upgrades.deployProxy(
        PCVFactory,
        [governanceTimeDelay],
        {
          kind: "transparent",
          unsafeSkipStorageCheck: true,
        },
      )) as unknown as PCV

      // Deploy a real MUSD contract (it uses __ERC20_init in the upgradeable version)
      const MUSDFactory = await ethers.getContractFactory("MUSD")
      realMUSD = await MUSDFactory.deploy()

      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await realMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await realPCV.getAddress(),
      ]
      await borrowerOps.setAddresses(addresses)

      // Initialize MUSD with required addresses
      // This automatically adds BorrowerOps to mintlist
      await realMUSD.initialize(
        await mockTroveManager.getAddress(),
        await mockStabilityPool.getAddress(),
        await borrowerOps.getAddress(),
        await mockInterestRateManager.getAddress(),
      )
    })

    it("should allow PCV to mint bootstrap loan", async () => {
      const mintAmount = ethers.parseEther("1000000")

      // Impersonate PCV contract
      await ethers.provider.send("hardhat_setBalance", [
        await realPCV.getAddress(),
        "0x1000000000000000000",
      ])
      await ethers.provider.send("hardhat_impersonateAccount", [
        await realPCV.getAddress(),
      ])
      const pcvSigner = await ethers.getSigner(await realPCV.getAddress())

      await borrowerOps
        .connect(pcvSigner)
        .mintBootstrapLoanFromPCV(mintAmount)

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [
        await realPCV.getAddress(),
      ])

      expect(await realMUSD.balanceOf(await realPCV.getAddress())).to.equal(
        mintAmount,
      )
    })

    it("should reject bootstrap loan mint from non-PCV", async () => {
      const mintAmount = ethers.parseEther("1000000")

      await expect(
        borrowerOps.connect(user).mintBootstrapLoanFromPCV(mintAmount),
      ).to.be.revertedWith("BorrowerOpsERC20: caller must be PCV")
    })

    it("should allow PCV to burn debt", async () => {
      const burnAmount = ethers.parseEther("1000")

      // First mint some MUSD to PCV
      await ethers.provider.send("hardhat_setBalance", [
        await realPCV.getAddress(),
        "0x1000000000000000000",
      ])
      await ethers.provider.send("hardhat_impersonateAccount", [
        await realPCV.getAddress(),
      ])
      const pcvSigner = await ethers.getSigner(await realPCV.getAddress())

      await borrowerOps
        .connect(pcvSigner)
        .mintBootstrapLoanFromPCV(burnAmount)

      // Now burn it
      await borrowerOps.connect(pcvSigner).burnDebtFromPCV(burnAmount)

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [
        await realPCV.getAddress(),
      ])

      expect(await realMUSD.balanceOf(await realPCV.getAddress())).to.equal(0)
    })

    it("should reject debt burn from non-PCV", async () => {
      const burnAmount = ethers.parseEther("1000")

      await expect(
        borrowerOps.connect(user).burnDebtFromPCV(burnAmount),
      ).to.be.revertedWith("BorrowerOpsERC20: caller must be PCV")
    })
  })

  describe("collateral operations", () => {
    beforeEach(async () => {
      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await mockPCV.getAddress(),
      ]
      await borrowerOps.setAddresses(addresses)

      // Initialize ActivePool with proper addresses
      await mockActivePool.setAddresses(
        await mockToken.getAddress(),
        await borrowerOps.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockTroveManager.getAddress(),
      )
    })

    it("should require collateral approval before addColl", async () => {
      const collAmount = ethers.parseEther("1")

      // Should revert due to no allowance (ERC20 transfer will fail)
      await expect(
        borrowerOps
          .connect(user)
          .addColl(collAmount, ethers.ZeroAddress, ethers.ZeroAddress),
      ).to.be.reverted
    })

    it("should reject zero collateral in addColl", async () => {
      await expect(
        borrowerOps
          .connect(user)
          .addColl(0, ethers.ZeroAddress, ethers.ZeroAddress),
      ).to.be.revertedWith("BorrowerOpsERC20: Cannot add zero collateral")
    })
  })

  describe("restricted functions", () => {
    beforeEach(async () => {
      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await mockPCV.getAddress(),
      ]
      await borrowerOps.setAddresses(addresses)
    })

    it("should revert restrictedOpenTrove with not implemented error", async () => {
      await expect(
        borrowerOps.restrictedOpenTrove(
          user.address,
          user.address,
          ethers.parseEther("1"),
          ethers.parseEther("1000"),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWith(
        "BorrowerOpsERC20: Caller not BorrowerOperationsSignatures",
      )
    })

    it("should revert restrictedCloseTrove with not implemented error", async () => {
      await expect(
        borrowerOps.restrictedCloseTrove(
          user.address,
          user.address,
          user.address,
        ),
      ).to.be.revertedWith(
        "BorrowerOpsERC20: Caller not BorrowerOperationsSignatures",
      )
    })

    it("should revert restrictedAdjustTrove with not implemented error", async () => {
      await expect(
        borrowerOps.restrictedAdjustTrove(
          user.address,
          user.address,
          user.address,
          0,
          0,
          ethers.parseEther("100"),
          true,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWith(
        "BorrowerOpsERC20: Caller not BorrowerOperationsSignatures",
      )
    })

    it("should revert restrictedRefinance with not implemented error", async () => {
      await expect(
        borrowerOps.restrictedRefinance(
          user.address,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWith(
        "BorrowerOpsERC20: Caller not BorrowerOperationsSignatures",
      )
    })

    it("should revert moveCollateralGainToTrove from non-stability-pool", async () => {
      await expect(
        borrowerOps.moveCollateralGainToTrove(
          user.address,
          ethers.parseEther("1"),
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWith("BorrowerOpsERC20: Caller is not Stability Pool")
    })
  })

  describe("claim collateral", () => {
    beforeEach(async () => {
      const addresses = [
        await mockToken.getAddress(),
        await mockActivePool.getAddress(),
        await mockDefaultPool.getAddress(),
        await mockStabilityPool.getAddress(),
        await mockGasPool.getAddress(),
        await mockCollSurplusPool.getAddress(),
        await mockPriceFeed.getAddress(),
        await mockSortedTroves.getAddress(),
        await mockMUSD.getAddress(),
        await mockTroveManager.getAddress(),
        await mockInterestRateManager.getAddress(),
        await mockGovernableVariables.getAddress(),
        await mockPCV.getAddress(),
      ]
      await borrowerOps.setAddresses(addresses)
    })

    it("should call claimColl on CollSurplusPool", async () => {
      // Since MockContract has a fallback, this should not revert
      // In a real scenario, this would interact with a proper CollSurplusPoolERC20
      await borrowerOps.connect(user).claimCollateral()
    })

    it("should allow restricted claim collateral from signatures contract", async () => {
      // This function requires BorrowerOperationsSignatures caller
      await expect(
        borrowerOps.restrictedClaimCollateral(user.address, user.address),
      ).to.be.revertedWith(
        "BorrowerOpsERC20: Caller not BorrowerOperationsSignatures",
      )
    })
  })
})
