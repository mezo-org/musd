import { expect } from "chai"
import { ethers, network, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { to1e18 } from "../utils"
import { ZERO_ADDRESS } from "../../helpers/constants"
import {
  ActivePoolERC20,
  BorrowerOperationsERC20,
  BorrowerOperationsSignatures,
  CollSurplusPoolERC20,
  DefaultPoolERC20,
  GasPool,
  GovernableVariables,
  HintHelpers,
  InterestRateManager,
  MockAggregator,
  MockERC20,
  MUSDTester,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPoolERC20,
  TroveManagerERC20,
} from "../../typechain"

describe("BorrowerOperationsERC20", () => {
  let activePool: ActivePoolERC20
  let borrowerOperations: BorrowerOperationsERC20
  let borrowerOperationsSignatures: BorrowerOperationsSignatures
  let collSurplusPool: CollSurplusPoolERC20
  let collateralToken: MockERC20
  let defaultPool: DefaultPoolERC20
  let gasPool: GasPool
  let governableVariables: GovernableVariables
  let hintHelpers: HintHelpers
  let interestRateManager: InterestRateManager
  let mockAggregator: MockAggregator
  let musd: MUSDTester
  let pcv: PCV
  let priceFeed: PriceFeed
  let sortedTroves: SortedTroves
  let stabilityPool: StabilityPoolERC20
  let troveManager: TroveManagerERC20

  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let council: HardhatEthersSigner
  let treasury: HardhatEthersSigner

  const MUSD_GAS_COMPENSATION = to1e18("200")
  const MCR = to1e18("1.1") // 110%
  const CCR = to1e18("1.5") // 150%

  async function deployFixture() {
    const signers = await ethers.getSigners()
    deployer = signers[0]
    alice = signers[1]
    bob = signers[2]
    carol = signers[3]
    council = signers[4]
    treasury = signers[5]

    // Deploy MockERC20 for collateral (18 decimals like wBTC on many chains)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    collateralToken = await MockERC20Factory.deploy(
      "Wrapped Bitcoin",
      "WBTC",
      18,
    )

    // Deploy MockAggregator for price feed (8 decimals like Chainlink)
    const MockAggregatorFactory =
      await ethers.getContractFactory("MockAggregator")
    mockAggregator = await MockAggregatorFactory.deploy(8)
    // Set price to $60,000 (8 decimals for Chainlink)
    await mockAggregator.setPrice(60000n * 10n ** 8n)

    // Deploy core contracts via proxy
    const PriceFeedFactory = await ethers.getContractFactory("PriceFeed")
    priceFeed = (await upgrades.deployProxy(PriceFeedFactory, [], {
      initializer: "initialize",
    })) as unknown as PriceFeed

    const SortedTrovesFactory = await ethers.getContractFactory("SortedTroves")
    sortedTroves = (await upgrades.deployProxy(SortedTrovesFactory, [], {
      initializer: "initialize",
    })) as unknown as SortedTroves

    const GasPoolFactory = await ethers.getContractFactory("GasPool")
    gasPool = (await upgrades.deployProxy(GasPoolFactory, [], {
      initializer: "initialize",
    })) as unknown as GasPool

    const GovernableVariablesFactory =
      await ethers.getContractFactory("GovernableVariables")
    const GOVERNANCE_TIME_DELAY = 7 * 24 * 60 * 60 // 7 days in seconds
    governableVariables = (await upgrades.deployProxy(
      GovernableVariablesFactory,
      [GOVERNANCE_TIME_DELAY],
      { initializer: "initialize" },
    )) as unknown as GovernableVariables

    const InterestRateManagerFactory =
      await ethers.getContractFactory("InterestRateManager")
    interestRateManager = (await upgrades.deployProxy(
      InterestRateManagerFactory,
      [],
      { initializer: "initialize" },
    )) as unknown as InterestRateManager

    // Deploy MUSDTester (testing version of MUSD - not upgradeable)
    const MUSDFactory = await ethers.getContractFactory("MUSDTester")
    musd = (await MUSDFactory.deploy()) as unknown as MUSDTester

    // Deploy PCV (requires governance time delay)
    const PCVFactory = await ethers.getContractFactory("PCV")
    pcv = (await upgrades.deployProxy(PCVFactory, [GOVERNANCE_TIME_DELAY], {
      initializer: "initialize",
    })) as unknown as PCV

    // Deploy ERC20 pool contracts via proxy
    const ActivePoolFactory =
      await ethers.getContractFactory("ActivePoolERC20")
    activePool = (await upgrades.deployProxy(ActivePoolFactory, [], {
      initializer: "initialize",
    })) as unknown as ActivePoolERC20

    const DefaultPoolFactory =
      await ethers.getContractFactory("DefaultPoolERC20")
    defaultPool = (await upgrades.deployProxy(DefaultPoolFactory, [], {
      initializer: "initialize",
    })) as unknown as DefaultPoolERC20

    const CollSurplusPoolFactory =
      await ethers.getContractFactory("CollSurplusPoolERC20")
    collSurplusPool = (await upgrades.deployProxy(CollSurplusPoolFactory, [], {
      initializer: "initialize",
    })) as unknown as CollSurplusPoolERC20

    const StabilityPoolFactory =
      await ethers.getContractFactory("StabilityPoolERC20")
    stabilityPool = (await upgrades.deployProxy(StabilityPoolFactory, [], {
      initializer: "initialize",
    })) as unknown as StabilityPoolERC20

    // Deploy BorrowerOperationsERC20 via proxy
    const BorrowerOperationsFactory = await ethers.getContractFactory(
      "BorrowerOperationsERC20",
    )
    borrowerOperations = (await upgrades.deployProxy(
      BorrowerOperationsFactory,
      [],
      { initializer: "initialize" },
    )) as unknown as BorrowerOperationsERC20

    // Deploy TroveManagerERC20 via proxy
    const TroveManagerFactory =
      await ethers.getContractFactory("TroveManagerERC20")
    troveManager = (await upgrades.deployProxy(TroveManagerFactory, [], {
      initializer: "initialize",
    })) as unknown as TroveManagerERC20

    // Deploy HintHelpers via proxy
    const HintHelpersFactory = await ethers.getContractFactory("HintHelpers")
    hintHelpers = (await upgrades.deployProxy(HintHelpersFactory, [], {
      initializer: "initialize",
    })) as unknown as HintHelpers

    // Deploy BorrowerOperationsSignatures via proxy
    const BorrowerOperationsSignaturesFactory = await ethers.getContractFactory(
      "BorrowerOperationsSignatures",
    )
    borrowerOperationsSignatures = (await upgrades.deployProxy(
      BorrowerOperationsSignaturesFactory,
      [],
      { initializer: "initialize" },
    )) as unknown as BorrowerOperationsSignatures

    // --- Set up all contract addresses ---

    // PriceFeed
    await priceFeed.setOracle(await mockAggregator.getAddress())

    // SortedTroves - args: size, borrowerOperationsAddress, troveManagerAddress
    await sortedTroves.setParams(
      1000000n,
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
    )

    // GovernableVariables - set council and treasury roles
    await governableVariables.startChangingRoles(council.address, treasury.address)
    await governableVariables.finalizeChangingRoles()

    // InterestRateManager
    await interestRateManager.setAddresses(
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await musd.getAddress(),
      await pcv.getAddress(),
      await troveManager.getAddress(),
    )

    // Initialize MUSD (MUSDTester is not upgradeable, uses initialize pattern)
    await musd.initialize(
      await troveManager.getAddress(),
      await stabilityPool.getAddress(),
      await borrowerOperations.getAddress(),
      await interestRateManager.getAddress(),
    )

    // MUSD - initialization already added borrowerOperations and interestRateManager to mint list
    // We also need to add troveManager to burn list for liquidations, but init already adds it

    // PCV - takes borrowerOperations and musd addresses
    await pcv.setAddresses(
      await borrowerOperations.getAddress(),
      await musd.getAddress(),
    )
    await pcv.startChangingRoles(council.address, treasury.address)
    await pcv.finalizeChangingRoles()

    // ActivePoolERC20
    await activePool.setAddresses(
      await collateralToken.getAddress(),
      await borrowerOperations.getAddress(),
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await interestRateManager.getAddress(),
      await stabilityPool.getAddress(),
      await troveManager.getAddress(),
    )

    // DefaultPoolERC20
    await defaultPool.setAddresses(
      await collateralToken.getAddress(),
      await activePool.getAddress(),
      await troveManager.getAddress(),
    )

    // CollSurplusPoolERC20
    await collSurplusPool.setAddresses(
      await collateralToken.getAddress(),
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
    )

    // StabilityPoolERC20
    await stabilityPool.setAddresses(
      await collateralToken.getAddress(),
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await musd.getAddress(),
      await priceFeed.getAddress(),
      await sortedTroves.getAddress(),
      await troveManager.getAddress(),
    )

    // BorrowerOperationsERC20
    // Addresses array order: [0] activePool, [1] borrowerOperationsSignatures, [2] collSurplusPool,
    // [3] collateralToken, [4] defaultPool, [5] gasPool, [6] governableVariables,
    // [7] interestRateManager, [8] musd, [9] pcv, [10] priceFeed,
    // [11] sortedTroves, [12] stabilityPool, [13] troveManager
    await borrowerOperations.setAddresses([
      await activePool.getAddress(),
      await borrowerOperationsSignatures.getAddress(),
      await collSurplusPool.getAddress(),
      await collateralToken.getAddress(),
      await defaultPool.getAddress(),
      await gasPool.getAddress(),
      await governableVariables.getAddress(),
      await interestRateManager.getAddress(),
      await musd.getAddress(),
      await pcv.getAddress(),
      await priceFeed.getAddress(),
      await sortedTroves.getAddress(),
      await stabilityPool.getAddress(),
      await troveManager.getAddress(),
    ])

    // TroveManagerERC20
    await troveManager.setAddresses(
      await collateralToken.getAddress(),
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await gasPool.getAddress(),
      await interestRateManager.getAddress(),
      await musd.getAddress(),
      await pcv.getAddress(),
      await priceFeed.getAddress(),
      await sortedTroves.getAddress(),
      await stabilityPool.getAddress(),
    )

    // HintHelpers
    await hintHelpers.setAddresses(
      await borrowerOperations.getAddress(),
      await sortedTroves.getAddress(),
      await troveManager.getAddress(),
    )

    // BorrowerOperationsSignatures
    await borrowerOperationsSignatures.setAddresses(
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await interestRateManager.getAddress(),
      await stabilityPool.getAddress(),
    )

    // Set default fees via governance
    await borrowerOperations
      .connect(council)
      .proposeBorrowingRate((to1e18("1") * 50n) / 10000n) // 0.5%
    await borrowerOperations
      .connect(council)
      .proposeRedemptionRate((to1e18("1") * 50n) / 10000n) // 0.5%

    // Fast forward 7 days for governance timelock
    await network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60])
    await network.provider.send("evm_mine")

    await borrowerOperations.connect(council).approveBorrowingRate()
    await borrowerOperations.connect(council).approveRedemptionRate()

    // Mint collateral to test users
    const collateralAmount = to1e18("100") // 100 WBTC
    await collateralToken.mint(alice.address, collateralAmount)
    await collateralToken.mint(bob.address, collateralAmount)
    await collateralToken.mint(carol.address, collateralAmount)

    return {
      activePool,
      borrowerOperations,
      collSurplusPool,
      collateralToken,
      defaultPool,
      gasPool,
      governableVariables,
      hintHelpers,
      interestRateManager,
      mockAggregator,
      musd,
      pcv,
      priceFeed,
      sortedTroves,
      stabilityPool,
      troveManager,
      deployer,
      alice,
      bob,
      carol,
      council,
      treasury,
    }
  }

  beforeEach(async () => {
    const fixture = await loadFixture(deployFixture)
    activePool = fixture.activePool
    borrowerOperations = fixture.borrowerOperations
    collSurplusPool = fixture.collSurplusPool
    collateralToken = fixture.collateralToken
    defaultPool = fixture.defaultPool
    gasPool = fixture.gasPool
    governableVariables = fixture.governableVariables
    hintHelpers = fixture.hintHelpers
    interestRateManager = fixture.interestRateManager
    mockAggregator = fixture.mockAggregator
    musd = fixture.musd
    pcv = fixture.pcv
    priceFeed = fixture.priceFeed
    sortedTroves = fixture.sortedTroves
    stabilityPool = fixture.stabilityPool
    troveManager = fixture.troveManager
    deployer = fixture.deployer
    alice = fixture.alice
    bob = fixture.bob
    carol = fixture.carol
    council = fixture.council
    treasury = fixture.treasury
  })

  // Helper function to open a trove
  async function openTrove(
    sender: HardhatEthersSigner,
    collAmount: bigint,
    debtAmount: bigint,
  ) {
    // Approve collateral transfer
    await collateralToken
      .connect(sender)
      .approve(await borrowerOperations.getAddress(), collAmount)

    // Open trove
    return borrowerOperations
      .connect(sender)
      .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS)
  }

  describe("name()", () => {
    it("returns the contract name", async () => {
      expect(await borrowerOperations.name()).to.equal("BorrowerOperationsERC20")
    })
  })

  describe("collateralToken()", () => {
    it("returns the collateral token address", async () => {
      expect(await borrowerOperations.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
    })
  })

  describe("minNetDebt()", () => {
    it("returns the minimum net debt", async () => {
      expect(await borrowerOperations.minNetDebt()).to.equal(to1e18("1800"))
    })
  })

  describe("openTrove()", () => {
    it("opens a trove with ERC20 collateral", async () => {
      const collAmount = to1e18("2") // 2 WBTC = $120,000
      const debtAmount = to1e18("10000") // 10,000 mUSD

      await openTrove(alice, collAmount, debtAmount)

      // Check trove was created
      expect(await sortedTroves.contains(alice.address)).to.be.true

      // Check collateral was transferred
      const troveData = await troveManager.Troves(alice.address)
      expect(troveData.coll).to.equal(collAmount)
    })

    it("transfers collateral from user to ActivePool", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      const userBalanceBefore = await collateralToken.balanceOf(alice.address)

      await openTrove(alice, collAmount, debtAmount)

      const userBalanceAfter = await collateralToken.balanceOf(alice.address)
      const activePoolBalance = await activePool.getCollateralBalance()

      expect(userBalanceBefore - userBalanceAfter).to.equal(collAmount)
      expect(activePoolBalance).to.equal(collAmount)
    })

    it("mints mUSD to the user", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      await openTrove(alice, collAmount, debtAmount)

      expect(await musd.balanceOf(alice.address)).to.equal(debtAmount)
    })

    it("emits TroveCreated event", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.emit(borrowerOperations, "TroveCreated")
    })

    it("reverts if ICR is below MCR", async () => {
      const collAmount = to1e18("0.1") // 0.1 WBTC = $6,000
      const debtAmount = to1e18("10000") // Would result in ICR < 110%

      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
      )
    })

    it("reverts if debt is below minimum net debt", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("100") // Below minimum net debt of 1800

      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith(
        "BorrowerOps: Trove's net debt must be greater than minimum",
      )
    })

    it("reverts if trove already exists", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      await openTrove(alice, collAmount, debtAmount)

      // Try to open again
      await collateralToken.mint(alice.address, collAmount)
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith("BorrowerOps: Trove is active")
    })

    it("reverts if collateral approval is insufficient", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      // Don't approve collateral
      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.reverted
    })

    it("charges borrowing fee", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      await openTrove(alice, collAmount, debtAmount)

      // Check that PCV received the fee
      const pcvBalance = await musd.balanceOf(await pcv.getAddress())
      expect(pcvBalance).to.be.gt(0)
    })
  })

  describe("closeTrove()", () => {
    beforeEach(async () => {
      // Open Alice's trove
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")
      await openTrove(alice, collAmount, debtAmount)

      // Open Bob's trove to keep system healthy
      await openTrove(bob, to1e18("5"), to1e18("50000"))
    })

    it("closes a trove and returns collateral", async () => {
      // Get total debt to repay
      const troveData = await troveManager.Troves(alice.address)
      const totalDebt =
        troveData.principal + troveData.interestOwed + MUSD_GAS_COMPENSATION

      // Transfer enough mUSD to Alice to close (borrow fee was paid)
      await musd.connect(bob).transfer(alice.address, to1e18("5000"))

      const collBalanceBefore = await collateralToken.balanceOf(alice.address)

      await borrowerOperations.connect(alice).closeTrove()

      // Check trove is closed
      expect(await sortedTroves.contains(alice.address)).to.be.false

      // Check collateral was returned
      const collBalanceAfter = await collateralToken.balanceOf(alice.address)
      expect(collBalanceAfter).to.be.gt(collBalanceBefore)
    })

    it("reverts if trove does not exist", async () => {
      await expect(
        borrowerOperations.connect(carol).closeTrove(),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })

    it("reverts if user has insufficient mUSD balance", async () => {
      // Transfer away Alice's mUSD
      const aliceBalance = await musd.balanceOf(alice.address)
      await musd.connect(alice).transfer(bob.address, aliceBalance)

      await expect(
        borrowerOperations.connect(alice).closeTrove(),
      ).to.be.revertedWith(
        "BorrowerOps: Caller doesnt have enough mUSD to make repayment",
      )
    })
  })

  describe("addColl()", () => {
    beforeEach(async () => {
      // Open Alice's trove
      await openTrove(alice, to1e18("2"), to1e18("10000"))
    })

    it("adds collateral to an existing trove", async () => {
      const addAmount = to1e18("1")
      const collBefore = (await troveManager.Troves(alice.address)).coll

      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), addAmount)

      await borrowerOperations
        .connect(alice)
        .addColl(addAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      const collAfter = (await troveManager.Troves(alice.address)).coll
      expect(collAfter - collBefore).to.equal(addAmount)
    })

    it("transfers collateral to ActivePool", async () => {
      const addAmount = to1e18("1")
      const poolBalanceBefore = await activePool.getCollateralBalance()

      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), addAmount)

      await borrowerOperations
        .connect(alice)
        .addColl(addAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      const poolBalanceAfter = await activePool.getCollateralBalance()
      expect(poolBalanceAfter - poolBalanceBefore).to.equal(addAmount)
    })

    it("reverts if trove does not exist", async () => {
      await collateralToken
        .connect(carol)
        .approve(await borrowerOperations.getAddress(), to1e18("1"))

      await expect(
        borrowerOperations
          .connect(carol)
          .addColl(to1e18("1"), ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })
  })

  describe("withdrawColl()", () => {
    beforeEach(async () => {
      // Open Alice's trove with high ICR
      await openTrove(alice, to1e18("5"), to1e18("10000"))
      // Open Bob's trove to keep system healthy
      await openTrove(bob, to1e18("5"), to1e18("10000"))
    })

    it("withdraws collateral from a trove", async () => {
      const withdrawAmount = to1e18("1")
      const collBalanceBefore = await collateralToken.balanceOf(alice.address)

      await borrowerOperations
        .connect(alice)
        .withdrawColl(withdrawAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      const collBalanceAfter = await collateralToken.balanceOf(alice.address)
      expect(collBalanceAfter - collBalanceBefore).to.equal(withdrawAmount)
    })

    it("decreases trove collateral", async () => {
      const withdrawAmount = to1e18("1")
      const collBefore = (await troveManager.Troves(alice.address)).coll

      await borrowerOperations
        .connect(alice)
        .withdrawColl(withdrawAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      const collAfter = (await troveManager.Troves(alice.address)).coll
      expect(collBefore - collAfter).to.equal(withdrawAmount)
    })

    it("reverts if withdrawal would make ICR < MCR", async () => {
      // Try to withdraw too much
      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawColl(to1e18("4.9"), ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
      )
    })
  })

  describe("adjustTrove()", () => {
    beforeEach(async () => {
      // Open troves
      await openTrove(alice, to1e18("5"), to1e18("10000"))
      await openTrove(bob, to1e18("5"), to1e18("10000"))
    })

    it("adds collateral and withdraws mUSD", async () => {
      const addColl = to1e18("1")
      const withdrawMUSD = to1e18("5000")

      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), addColl)

      const collBefore = (await troveManager.Troves(alice.address)).coll
      const musdBefore = await musd.balanceOf(alice.address)

      await borrowerOperations
        .connect(alice)
        .adjustTrove(addColl, 0, withdrawMUSD, true, ZERO_ADDRESS, ZERO_ADDRESS)

      const collAfter = (await troveManager.Troves(alice.address)).coll
      const musdAfter = await musd.balanceOf(alice.address)

      expect(collAfter - collBefore).to.equal(addColl)
      expect(musdAfter - musdBefore).to.equal(withdrawMUSD)
    })

    it("withdraws collateral and repays mUSD", async () => {
      const withdrawColl = to1e18("1")
      const repayMUSD = to1e18("5000")

      const collBefore = (await troveManager.Troves(alice.address)).coll
      const collBalanceBefore = await collateralToken.balanceOf(alice.address)

      await borrowerOperations
        .connect(alice)
        .adjustTrove(
          0,
          withdrawColl,
          repayMUSD,
          false,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
        )

      const collAfter = (await troveManager.Troves(alice.address)).coll
      const collBalanceAfter = await collateralToken.balanceOf(alice.address)

      expect(collBefore - collAfter).to.equal(withdrawColl)
      expect(collBalanceAfter - collBalanceBefore).to.equal(withdrawColl)
    })

    it("reverts if both depositing and withdrawing collateral", async () => {
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), to1e18("1"))

      await expect(
        borrowerOperations
          .connect(alice)
          .adjustTrove(
            to1e18("1"),
            to1e18("0.5"),
            0,
            false,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
          ),
      ).to.be.revertedWith("BorrowerOperations: Cannot withdraw and add coll")
    })

    it("reverts if no adjustment is made", async () => {
      await expect(
        borrowerOperations
          .connect(alice)
          .adjustTrove(0, 0, 0, false, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith(
        "BorrowerOps: There must be either a collateral change or a debt change",
      )
    })
  })

  describe("withdrawMUSD()", () => {
    beforeEach(async () => {
      // Open troves with high ICR
      await openTrove(alice, to1e18("5"), to1e18("10000"))
      await openTrove(bob, to1e18("5"), to1e18("10000"))
    })

    it("withdraws additional mUSD from a trove", async () => {
      const withdrawAmount = to1e18("5000")
      const musdBefore = await musd.balanceOf(alice.address)

      await borrowerOperations
        .connect(alice)
        .withdrawMUSD(withdrawAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      const musdAfter = await musd.balanceOf(alice.address)
      expect(musdAfter - musdBefore).to.equal(withdrawAmount)
    })

    it("reverts if withdrawal would make ICR < MCR", async () => {
      // Alice has 5 BTC collateral ($300,000 at $60k/BTC) and ~$10,200 debt (10k + gas comp)
      // To make ICR < MCR (110%), debt must be > $300,000 / 1.1 = $272,727
      // So withdrawing $265,000 should push debt to ~$275,200 and ICR to ~109%
      await expect(
        borrowerOperations
          .connect(alice)
          .withdrawMUSD(to1e18("265000"), ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
      )
    })
  })

  describe("repayMUSD()", () => {
    beforeEach(async () => {
      await openTrove(alice, to1e18("5"), to1e18("50000"))
      await openTrove(bob, to1e18("5"), to1e18("10000"))
    })

    it("repays mUSD and decreases debt", async () => {
      const repayAmount = to1e18("10000")
      const debtBefore = (await troveManager.Troves(alice.address)).principal

      await borrowerOperations
        .connect(alice)
        .repayMUSD(repayAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      const debtAfter = (await troveManager.Troves(alice.address)).principal
      expect(debtBefore - debtAfter).to.be.closeTo(repayAmount, to1e18("1"))
    })

    it("reverts if repayment leaves debt below minimum", async () => {
      // Try to repay almost everything, leaving debt below minimum
      await expect(
        borrowerOperations
          .connect(alice)
          .repayMUSD(to1e18("49000"), ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.revertedWith(
        "BorrowerOps: Trove's net debt must be greater than minimum",
      )
    })
  })

  describe("getBorrowingFee()", () => {
    it("returns the correct borrowing fee", async () => {
      const debt = to1e18("10000")
      const fee = await borrowerOperations.getBorrowingFee(debt)

      // Fee should be 0.5% of debt
      expect(fee).to.equal(to1e18("50")) // 10000 * 0.005 = 50
    })
  })

  describe("ERC20 approval handling", () => {
    it("requires approval before opening trove", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      // No approval - should revert
      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.be.reverted
    })

    it("handles exact approval amount", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      // Approve exact amount
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), collAmount)

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.not.be.reverted
    })

    it("handles unlimited approval", async () => {
      const collAmount = to1e18("2")
      const debtAmount = to1e18("10000")

      // Approve unlimited
      await collateralToken
        .connect(alice)
        .approve(
          await borrowerOperations.getAddress(),
          ethers.MaxUint256,
        )

      await expect(
        borrowerOperations
          .connect(alice)
          .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS),
      ).to.not.be.reverted
    })
  })

  describe("Governance functions", () => {
    it("proposes and approves new minimum net debt", async () => {
      const newMinNetDebt = to1e18("2000")

      await borrowerOperations.connect(council).proposeMinNetDebt(newMinNetDebt)

      // Fast forward 7 days
      await network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60])
      await network.provider.send("evm_mine")

      await borrowerOperations.connect(council).approveMinNetDebt()

      expect(await borrowerOperations.minNetDebt()).to.equal(newMinNetDebt)
    })

    it("reverts if non-governance tries to change min net debt", async () => {
      await expect(
        borrowerOperations.connect(alice).proposeMinNetDebt(to1e18("2000")),
      ).to.be.revertedWith(
        "BorrowerOps: Only governance can call this function",
      )
    })

    it("reverts if approving before timelock expires", async () => {
      await borrowerOperations.connect(council).proposeMinNetDebt(to1e18("2000"))

      await expect(
        borrowerOperations.connect(council).approveMinNetDebt(),
      ).to.be.revertedWith(
        "Must wait at least 7 days before approving a change to Minimum Net Debt",
      )
    })
  })
})
