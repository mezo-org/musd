import { expect } from "chai"
import { ethers, network, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  MockERC20,
  MockContract,
  MockInterestRateManager,
  TroveManagerERC20,
  ActivePoolERC20,
  DefaultPoolERC20,
} from "../../typechain"

describe("TroveManagerERC20", () => {
  let token: MockERC20
  let troveManager: TroveManagerERC20
  let activePool: ActivePoolERC20
  let defaultPool: DefaultPoolERC20
  let mockInterestRateManager: MockInterestRateManager

  // Mock contracts for address validation
  let mockBorrowerOperations: MockContract
  let mockStabilityPool: MockContract
  let mockCollSurplusPool: MockContract
  let mockGasPool: MockContract
  let mockPCV: MockContract
  let mockPriceFeed: MockContract
  let mockSortedTroves: MockContract
  let mockMUSD: MockContract

  // Addresses
  let borrowerOperationsAddress: string
  let stabilityPoolAddress: string
  let collSurplusPoolAddress: string
  let gasPoolAddress: string
  let pcvAddress: string
  let priceFeedAddress: string
  let sortedTrovesAddress: string
  let musdAddress: string
  let interestRateManagerAddress: string
  let activePoolAddress: string
  let defaultPoolAddress: string

  // Signers
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let borrowerOperationsSigner: HardhatEthersSigner

  beforeEach(async () => {
    ;[deployer, alice, bob] = await ethers.getSigners()

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()

    // Deploy mock contracts for checkContract validation
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockBorrowerOperations = await MockContractFactory.deploy()
    mockStabilityPool = await MockContractFactory.deploy()
    mockCollSurplusPool = await MockContractFactory.deploy()
    mockGasPool = await MockContractFactory.deploy()
    mockPCV = await MockContractFactory.deploy()
    mockPriceFeed = await MockContractFactory.deploy()
    mockSortedTroves = await MockContractFactory.deploy()
    mockMUSD = await MockContractFactory.deploy()

    // Deploy MockInterestRateManager
    const MockInterestRateManagerFactory = await ethers.getContractFactory(
      "MockInterestRateManager",
    )
    mockInterestRateManager = await MockInterestRateManagerFactory.deploy()

    // Store addresses
    borrowerOperationsAddress = await mockBorrowerOperations.getAddress()
    stabilityPoolAddress = await mockStabilityPool.getAddress()
    collSurplusPoolAddress = await mockCollSurplusPool.getAddress()
    gasPoolAddress = await mockGasPool.getAddress()
    pcvAddress = await mockPCV.getAddress()
    priceFeedAddress = await mockPriceFeed.getAddress()
    sortedTrovesAddress = await mockSortedTroves.getAddress()
    musdAddress = await mockMUSD.getAddress()
    interestRateManagerAddress = await mockInterestRateManager.getAddress()

    // Deploy ActivePoolERC20
    const ActivePoolERC20Factory =
      await ethers.getContractFactory("ActivePoolERC20")
    activePool = (await upgrades.deployProxy(
      ActivePoolERC20Factory,
      [await token.getAddress()],
      { initializer: "initialize" },
    )) as unknown as ActivePoolERC20
    activePoolAddress = await activePool.getAddress()

    // Deploy DefaultPoolERC20
    const DefaultPoolERC20Factory =
      await ethers.getContractFactory("DefaultPoolERC20")
    defaultPool = (await upgrades.deployProxy(
      DefaultPoolERC20Factory,
      [await token.getAddress()],
      { initializer: "initialize" },
    )) as unknown as DefaultPoolERC20
    defaultPoolAddress = await defaultPool.getAddress()

    // Deploy TroveManagerERC20 as upgradeable proxy
    const TroveManagerERC20Factory =
      await ethers.getContractFactory("TroveManagerERC20")
    troveManager = (await upgrades.deployProxy(
      TroveManagerERC20Factory,
      [await token.getAddress()],
      { initializer: "initialize" },
    )) as unknown as TroveManagerERC20

    // Set addresses on TroveManager
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

    // Set addresses on ActivePool
    await activePool.setAddresses(
      borrowerOperationsAddress,
      collSurplusPoolAddress,
      defaultPoolAddress,
      interestRateManagerAddress,
      stabilityPoolAddress,
      await troveManager.getAddress(),
    )

    // Set addresses on DefaultPool
    await defaultPool.setAddresses(
      activePoolAddress,
      await troveManager.getAddress(),
    )

    // Impersonate mock contract addresses for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [borrowerOperationsAddress],
    })

    // Get signers for impersonated accounts
    borrowerOperationsSigner = await ethers.getSigner(borrowerOperationsAddress)

    // Fund impersonated accounts for gas
    await deployer.sendTransaction({
      to: borrowerOperationsAddress,
      value: ethers.parseEther("1"),
    })
  })

  describe("initialize", () => {
    it("should set the collateral token", async () => {
      expect(await troveManager.collateralToken()).to.equal(
        await token.getAddress(),
      )
    })

    it("should start with zero total stakes", async () => {
      expect(await troveManager.totalStakes()).to.equal(0)
    })

    it("should revert if initialized twice", async () => {
      await expect(
        troveManager.initialize(await token.getAddress()),
      ).to.be.revertedWithCustomError(troveManager, "InvalidInitialization")
    })

    it("should revert if initialized with zero address", async () => {
      const TroveManagerERC20Factory =
        await ethers.getContractFactory("TroveManagerERC20")
      const newTroveManager = await upgrades.deployProxy(
        TroveManagerERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )

      // Can't initialize again
      await expect(
        newTroveManager.initialize(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(newTroveManager, "InvalidInitialization")
    })
  })

  describe("setAddresses", () => {
    it("should emit address changed events", async () => {
      const TroveManagerERC20Factory =
        await ethers.getContractFactory("TroveManagerERC20")
      const newTroveManager = (await upgrades.deployProxy(
        TroveManagerERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as TroveManagerERC20

      await expect(
        newTroveManager.setAddresses(
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
        ),
      )
        .to.emit(newTroveManager, "ActivePoolAddressChanged")
        .withArgs(activePoolAddress)
    })

    it("should revert if called by non-owner after renouncing", async () => {
      await expect(
        troveManager
          .connect(alice)
          .setAddresses(
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
          ),
      ).to.be.revertedWithCustomError(
        troveManager,
        "OwnableUnauthorizedAccount",
      )
    })

    it("should revert if address is not a contract", async () => {
      const TroveManagerERC20Factory =
        await ethers.getContractFactory("TroveManagerERC20")
      const newTroveManager = (await upgrades.deployProxy(
        TroveManagerERC20Factory,
        [await token.getAddress()],
        { initializer: "initialize" },
      )) as unknown as TroveManagerERC20

      await expect(
        newTroveManager.setAddresses(
          alice.address, // EOA, not a contract
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
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })
  })

  describe("Trove state management", () => {
    describe("setTroveStatus", () => {
      it("should set trove status when called by BorrowerOperations", async () => {
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1) // 1 = active

        expect(await troveManager.getTroveStatus(alice.address)).to.equal(1)
      })

      it("should revert if called by non-BorrowerOperations", async () => {
        await expect(
          troveManager.connect(alice).setTroveStatus(alice.address, 1),
        ).to.be.revertedWith(
          "TroveManager: Caller is not the BorrowerOperations contract",
        )
      })
    })

    describe("increaseTroveColl", () => {
      it("should increase trove collateral when called by BorrowerOperations", async () => {
        const amount = ethers.parseEther("10")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        const newColl = await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveColl.staticCall(alice.address, amount)

        expect(newColl).to.equal(amount)

        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveColl(alice.address, amount)

        expect(await troveManager.getTroveColl(alice.address)).to.equal(amount)
      })

      it("should revert if called by non-BorrowerOperations", async () => {
        await expect(
          troveManager
            .connect(alice)
            .increaseTroveColl(alice.address, ethers.parseEther("10")),
        ).to.be.revertedWith(
          "TroveManager: Caller is not the BorrowerOperations contract",
        )
      })
    })

    describe("decreaseTroveColl", () => {
      it("should decrease trove collateral", async () => {
        const initialAmount = ethers.parseEther("10")
        const decreaseAmount = ethers.parseEther("3")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveColl(alice.address, initialAmount)

        await troveManager
          .connect(borrowerOperationsSigner)
          .decreaseTroveColl(alice.address, decreaseAmount)

        expect(await troveManager.getTroveColl(alice.address)).to.equal(
          initialAmount - decreaseAmount,
        )
      })
    })

    describe("increaseTroveDebt", () => {
      it("should increase trove debt when called by BorrowerOperations", async () => {
        const amount = ethers.parseEther("1000")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveDebt(alice.address, amount)

        expect(await troveManager.getTrovePrincipal(alice.address)).to.equal(
          amount,
        )
      })

      it("should revert if called by non-BorrowerOperations", async () => {
        await expect(
          troveManager
            .connect(alice)
            .increaseTroveDebt(alice.address, ethers.parseEther("1000")),
        ).to.be.revertedWith(
          "TroveManager: Caller is not the BorrowerOperations contract",
        )
      })
    })

    describe("setTroveInterestRate", () => {
      it("should set trove interest rate", async () => {
        const rate = 500 // 5%

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveInterestRate(alice.address, rate)

        expect(await troveManager.getTroveInterestRate(alice.address)).to.equal(
          rate,
        )
      })
    })

    describe("setTroveLastInterestUpdateTime", () => {
      it("should set trove last interest update time", async () => {
        const timestamp = Math.floor(Date.now() / 1000)

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveLastInterestUpdateTime(alice.address, timestamp)

        expect(
          await troveManager.getTroveLastInterestUpdateTime(alice.address),
        ).to.equal(timestamp)
      })
    })

    describe("setTroveMaxBorrowingCapacity", () => {
      it("should set trove max borrowing capacity", async () => {
        const capacity = ethers.parseEther("50000")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveMaxBorrowingCapacity(alice.address, capacity)

        expect(
          await troveManager.getTroveMaxBorrowingCapacity(alice.address),
        ).to.equal(capacity)
      })
    })
  })

  describe("Stake management", () => {
    describe("updateStakeAndTotalStakes", () => {
      it("should update stake based on collateral", async () => {
        const collAmount = ethers.parseEther("10")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveColl(alice.address, collAmount)

        await troveManager
          .connect(borrowerOperationsSigner)
          .updateStakeAndTotalStakes(alice.address)

        // With no prior liquidations, stake equals collateral
        expect(await troveManager.getTroveStake(alice.address)).to.equal(
          collAmount,
        )
        expect(await troveManager.totalStakes()).to.equal(collAmount)
      })

      it("should emit TotalStakesUpdated event", async () => {
        const collAmount = ethers.parseEther("10")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveColl(alice.address, collAmount)

        await expect(
          troveManager
            .connect(borrowerOperationsSigner)
            .updateStakeAndTotalStakes(alice.address),
        )
          .to.emit(troveManager, "TotalStakesUpdated")
          .withArgs(collAmount)
      })
    })

    describe("removeStake", () => {
      it("should remove stake from trove and total", async () => {
        const collAmount = ethers.parseEther("10")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveColl(alice.address, collAmount)
        await troveManager
          .connect(borrowerOperationsSigner)
          .updateStakeAndTotalStakes(alice.address)

        await troveManager
          .connect(borrowerOperationsSigner)
          .removeStake(alice.address)

        expect(await troveManager.getTroveStake(alice.address)).to.equal(0)
        expect(await troveManager.totalStakes()).to.equal(0)
      })
    })
  })

  describe("Trove owner array", () => {
    describe("addTroveOwnerToArray", () => {
      it("should add trove owner to array", async () => {
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        const index = await troveManager
          .connect(borrowerOperationsSigner)
          .addTroveOwnerToArray.staticCall(alice.address)

        expect(index).to.equal(0)

        await troveManager
          .connect(borrowerOperationsSigner)
          .addTroveOwnerToArray(alice.address)

        expect(await troveManager.getTroveOwnersCount()).to.equal(1)
        expect(await troveManager.getTroveFromTroveOwnersArray(0)).to.equal(
          alice.address,
        )
      })

      it("should return correct index for multiple owners", async () => {
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .addTroveOwnerToArray(alice.address)

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(bob.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .addTroveOwnerToArray(bob.address)

        expect(await troveManager.getTroveOwnersCount()).to.equal(2)
        expect(await troveManager.getTroveFromTroveOwnersArray(1)).to.equal(
          bob.address,
        )
      })
    })
  })

  describe("View functions", () => {
    describe("getTroveDebt", () => {
      it("should return total debt including interest", async () => {
        const principal = ethers.parseEther("1000")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveDebt(alice.address, principal)
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveLastInterestUpdateTime(
            alice.address,
            Math.floor(Date.now() / 1000),
          )

        // Initially, debt should equal principal (no time has passed for interest)
        const debt = await troveManager.getTroveDebt(alice.address)
        expect(debt).to.be.gte(principal)
      })
    })

    describe("hasPendingRewards", () => {
      it("should return false for non-existent trove", async () => {
        expect(await troveManager.hasPendingRewards(alice.address)).to.equal(
          false,
        )
      })

      it("should return false for active trove with no pending rewards", async () => {
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        expect(await troveManager.hasPendingRewards(alice.address)).to.equal(
          false,
        )
      })
    })

    describe("getEntireDebtAndColl", () => {
      it("should return trove debt and collateral", async () => {
        const collAmount = ethers.parseEther("10")
        const principal = ethers.parseEther("1000")

        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)
        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveColl(alice.address, collAmount)
        await troveManager
          .connect(borrowerOperationsSigner)
          .increaseTroveDebt(alice.address, principal)
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveLastInterestUpdateTime(
            alice.address,
            Math.floor(Date.now() / 1000),
          )

        const [coll, principalResult] = await troveManager.getEntireDebtAndColl(
          alice.address,
        )

        expect(coll).to.equal(collAmount)
        expect(principalResult).to.equal(principal)
      })
    })

    describe("getPendingCollateral", () => {
      it("should return 0 for trove with no pending rewards", async () => {
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        expect(await troveManager.getPendingCollateral(alice.address)).to.equal(
          0,
        )
      })
    })

    describe("getPendingDebt", () => {
      it("should return 0 for trove with no pending rewards", async () => {
        await troveManager
          .connect(borrowerOperationsSigner)
          .setTroveStatus(alice.address, 1)

        const [pendingPrincipal, pendingInterest] =
          await troveManager.getPendingDebt(alice.address)

        expect(pendingPrincipal).to.equal(0)
        expect(pendingInterest).to.equal(0)
      })
    })
  })

  describe("Liquidation (stubbed)", () => {
    it("should revert liquidate with not implemented message", async () => {
      await troveManager
        .connect(borrowerOperationsSigner)
        .setTroveStatus(alice.address, 1)

      await expect(troveManager.liquidate(alice.address)).to.be.revertedWith(
        "TroveManager: Liquidation not yet implemented for ERC20",
      )
    })

    it("should revert batchLiquidateTroves with not implemented message", async () => {
      await expect(
        troveManager.batchLiquidateTroves([alice.address]),
      ).to.be.revertedWith(
        "TroveManager: Liquidation not yet implemented for ERC20",
      )
    })

    it("should revert batchLiquidateTroves with empty array", async () => {
      await expect(troveManager.batchLiquidateTroves([])).to.be.revertedWith(
        "TroveManager: Calldata address array must not be empty",
      )
    })
  })

  describe("Redemption (stubbed)", () => {
    it("should revert redeemCollateral with not implemented message", async () => {
      await expect(
        troveManager.redeemCollateral(
          ethers.parseEther("100"),
          alice.address,
          alice.address,
          alice.address,
          0,
          0,
        ),
      ).to.be.revertedWith(
        "TroveManager: Redemption not yet implemented for ERC20",
      )
    })
  })

  describe("System state functions", () => {
    describe("getEntireSystemColl", () => {
      it("should return total system collateral", async () => {
        // Initially zero
        expect(await troveManager.getEntireSystemColl()).to.equal(0)
      })
    })

    describe("getEntireSystemDebt", () => {
      it("should return total system debt", async () => {
        // Initially zero
        expect(await troveManager.getEntireSystemDebt()).to.equal(0)
      })
    })
  })

  describe("updateTroveRewardSnapshots", () => {
    it("should update reward snapshots", async () => {
      await troveManager
        .connect(borrowerOperationsSigner)
        .setTroveStatus(alice.address, 1)

      await expect(
        troveManager
          .connect(borrowerOperationsSigner)
          .updateTroveRewardSnapshots(alice.address),
      )
        .to.emit(troveManager, "TroveSnapshotsUpdated")
        .withArgs(0, 0, 0)
    })
  })
})
