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

describe("ERC20 Integration Tests", () => {
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
  let dennis: HardhatEthersSigner
  let council: HardhatEthersSigner
  let treasury: HardhatEthersSigner

  const MUSD_GAS_COMPENSATION = to1e18("200")
  const GOVERNANCE_TIME_DELAY = 7 * 24 * 60 * 60 // 7 days in seconds

  // Helper function to deploy all contracts
  async function deployFullSystem() {
    const signers = await ethers.getSigners()
    deployer = signers[0]
    alice = signers[1]
    bob = signers[2]
    carol = signers[3]
    dennis = signers[4]
    council = signers[5]
    treasury = signers[6]

    // Deploy MockERC20 for collateral
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    collateralToken = await MockERC20Factory.deploy(
      "Wrapped Bitcoin",
      "WBTC",
      18,
    )

    // Deploy MockAggregator for price feed
    const MockAggregatorFactory =
      await ethers.getContractFactory("MockAggregator")
    mockAggregator = await MockAggregatorFactory.deploy(8) // 8 decimals like Chainlink
    // Set price to $60,000
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

    // Deploy MUSDTester (not upgradeable)
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

    const BorrowerOperationsFactory = await ethers.getContractFactory(
      "BorrowerOperationsERC20",
    )
    borrowerOperations = (await upgrades.deployProxy(
      BorrowerOperationsFactory,
      [],
      { initializer: "initialize" },
    )) as unknown as BorrowerOperationsERC20

    const TroveManagerFactory =
      await ethers.getContractFactory("TroveManagerERC20")
    troveManager = (await upgrades.deployProxy(TroveManagerFactory, [], {
      initializer: "initialize",
    })) as unknown as TroveManagerERC20

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

    // InterestRateManager - 5 args
    await interestRateManager.setAddresses(
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await musd.getAddress(),
      await pcv.getAddress(),
      await troveManager.getAddress(),
    )

    // Initialize MUSD
    await musd.initialize(
      await troveManager.getAddress(),
      await stabilityPool.getAddress(),
      await borrowerOperations.getAddress(),
      await interestRateManager.getAddress(),
    )

    // MUSD - initialization already added borrowerOperations and interestRateManager to mint list

    // PCV - takes borrowerOperations and musd addresses
    await pcv.setAddresses(
      await borrowerOperations.getAddress(),
      await musd.getAddress(),
    )
    await pcv.startChangingRoles(council.address, treasury.address)
    await pcv.finalizeChangingRoles()

    await activePool.setAddresses(
      await collateralToken.getAddress(),
      await borrowerOperations.getAddress(),
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await interestRateManager.getAddress(),
      await stabilityPool.getAddress(),
      await troveManager.getAddress(),
    )

    await defaultPool.setAddresses(
      await collateralToken.getAddress(),
      await activePool.getAddress(),
      await troveManager.getAddress(),
    )

    await collSurplusPool.setAddresses(
      await collateralToken.getAddress(),
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
    )

    await stabilityPool.setAddresses(
      await collateralToken.getAddress(),
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await musd.getAddress(),
      await priceFeed.getAddress(),
      await sortedTroves.getAddress(),
      await troveManager.getAddress(),
    )

    // BorrowerOperationsERC20 setAddresses
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

    // HintHelpers - 3 args
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

    // Set default fees
    await borrowerOperations
      .connect(council)
      .proposeBorrowingRate((to1e18("1") * 50n) / 10000n)
    await borrowerOperations
      .connect(council)
      .proposeRedemptionRate((to1e18("1") * 50n) / 10000n)

    await network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60])
    await network.provider.send("evm_mine")

    await borrowerOperations.connect(council).approveBorrowingRate()
    await borrowerOperations.connect(council).approveRedemptionRate()

    // Mint collateral to test users
    const collateralAmount = to1e18("100")
    await collateralToken.mint(alice.address, collateralAmount)
    await collateralToken.mint(bob.address, collateralAmount)
    await collateralToken.mint(carol.address, collateralAmount)
    await collateralToken.mint(dennis.address, collateralAmount)

    return {
      activePool,
      borrowerOperations,
      borrowerOperationsSignatures,
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
      dennis,
      council,
      treasury,
    }
  }

  beforeEach(async () => {
    const fixture = await loadFixture(deployFullSystem)
    activePool = fixture.activePool
    borrowerOperations = fixture.borrowerOperations
    borrowerOperationsSignatures = fixture.borrowerOperationsSignatures
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
    dennis = fixture.dennis
    council = fixture.council
    treasury = fixture.treasury
  })

  // Helper function to open a trove
  async function openTrove(
    sender: HardhatEthersSigner,
    collAmount: bigint,
    debtAmount: bigint,
  ) {
    await collateralToken
      .connect(sender)
      .approve(await borrowerOperations.getAddress(), collAmount)

    return borrowerOperations
      .connect(sender)
      .openTrove(collAmount, debtAmount, ZERO_ADDRESS, ZERO_ADDRESS)
  }

  describe("Deployment and Initialization", () => {
    it("deploys all ERC20 contracts successfully", async () => {
      expect(await activePool.getAddress()).to.not.equal(ZERO_ADDRESS)
      expect(await borrowerOperations.getAddress()).to.not.equal(ZERO_ADDRESS)
      expect(await collSurplusPool.getAddress()).to.not.equal(ZERO_ADDRESS)
      expect(await defaultPool.getAddress()).to.not.equal(ZERO_ADDRESS)
      expect(await stabilityPool.getAddress()).to.not.equal(ZERO_ADDRESS)
      expect(await troveManager.getAddress()).to.not.equal(ZERO_ADDRESS)
    })

    it("sets collateral token correctly on all contracts", async () => {
      const collTokenAddress = await collateralToken.getAddress()

      expect(await activePool.collateralToken()).to.equal(collTokenAddress)
      expect(await borrowerOperations.collateralToken()).to.equal(
        collTokenAddress,
      )
      expect(await collSurplusPool.collateralToken()).to.equal(collTokenAddress)
      expect(await defaultPool.collateralToken()).to.equal(collTokenAddress)
      expect(await stabilityPool.collateralToken()).to.equal(collTokenAddress)
      expect(await troveManager.collateralToken()).to.equal(collTokenAddress)
    })

    it("initializes pools with zero balances", async () => {
      expect(await activePool.getCollateralBalance()).to.equal(0)
      expect(await activePool.getDebt()).to.equal(0)
      expect(await defaultPool.getCollateralBalance()).to.equal(0)
      expect(await defaultPool.getDebt()).to.equal(0)
      expect(await collSurplusPool.getCollateralBalance()).to.equal(0)
      expect(await stabilityPool.getCollateralBalance()).to.equal(0)
      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(0)
    })

    it("initializes SortedTroves as empty", async () => {
      expect(await sortedTroves.isEmpty()).to.be.true
      expect(await sortedTroves.getSize()).to.equal(0)
    })
  })

  describe("Full Trove Lifecycle", () => {
    it("opens, adjusts, and closes a trove", async () => {
      // 1. Open trove
      const collAmount = to1e18("2")
      const debtAmount = to1e18("20000")

      await openTrove(alice, collAmount, debtAmount)

      expect(await sortedTroves.contains(alice.address)).to.be.true
      expect(await activePool.getCollateralBalance()).to.equal(collAmount)

      // 2. Add collateral
      const addAmount = to1e18("1")
      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), addAmount)
      await borrowerOperations
        .connect(alice)
        .addColl(addAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      expect(await activePool.getCollateralBalance()).to.equal(
        collAmount + addAmount,
      )

      // 3. Withdraw some debt
      await borrowerOperations
        .connect(alice)
        .withdrawMUSD(to1e18("5000"), ZERO_ADDRESS, ZERO_ADDRESS)

      const aliceMUSD = await musd.balanceOf(alice.address)
      expect(aliceMUSD).to.be.gt(debtAmount)

      // 4. Open Bob's trove to keep system healthy
      await openTrove(bob, to1e18("5"), to1e18("50000"))

      // 5. Close Alice's trove
      // Transfer some mUSD to Alice if needed
      await musd.connect(bob).transfer(alice.address, to1e18("10000"))

      await borrowerOperations.connect(alice).closeTrove()

      expect(await sortedTroves.contains(alice.address)).to.be.false

      // Alice should have received her collateral back
      const aliceColl = await collateralToken.balanceOf(alice.address)
      expect(aliceColl).to.be.gt(to1e18("90")) // Started with 100, used 3 for trove
    })

    it("handles refinancing", async () => {
      // Open Alice's trove
      await openTrove(alice, to1e18("5"), to1e18("50000"))

      // Open Bob's trove to keep system healthy
      await openTrove(bob, to1e18("5"), to1e18("50000"))

      const troveBefore = await troveManager.Troves(alice.address)
      const interestRateBefore = troveBefore.interestRate

      // Refinance (assumes interest rate is the same, but this updates the trove)
      await borrowerOperations
        .connect(alice)
        .refinance(ZERO_ADDRESS, ZERO_ADDRESS)

      const troveAfter = await troveManager.Troves(alice.address)

      // Refinancing should update the trove
      expect(troveAfter.lastInterestUpdateTime).to.be.gte(
        troveBefore.lastInterestUpdateTime,
      )
    })
  })

  describe("Multiple Troves Interaction", () => {
    it("maintains correct ordering in SortedTroves", async () => {
      // Open troves with different ICRs
      // Alice: high ICR (most collateralized)
      await openTrove(alice, to1e18("5"), to1e18("10000"))

      // Bob: medium ICR
      await openTrove(bob, to1e18("3"), to1e18("10000"))

      // Carol: lower ICR
      await openTrove(carol, to1e18("2"), to1e18("10000"))

      // Check order (highest ICR first)
      const first = await sortedTroves.getFirst()
      const last = await sortedTroves.getLast()

      // Alice should have highest NICR
      expect(first).to.equal(alice.address)
      // Carol should have lowest NICR
      expect(last).to.equal(carol.address)
    })

    it("tracks total system collateral correctly", async () => {
      const coll1 = to1e18("2")
      const coll2 = to1e18("3")
      const coll3 = to1e18("4")

      await openTrove(alice, coll1, to1e18("10000"))
      await openTrove(bob, coll2, to1e18("10000"))
      await openTrove(carol, coll3, to1e18("10000"))

      const totalColl = await activePool.getCollateralBalance()
      expect(totalColl).to.equal(coll1 + coll2 + coll3)
    })

    it("tracks total system debt correctly", async () => {
      const debt1 = to1e18("10000")
      const debt2 = to1e18("20000")
      const debt3 = to1e18("30000")

      await openTrove(alice, to1e18("2"), debt1)
      await openTrove(bob, to1e18("3"), debt2)
      await openTrove(carol, to1e18("4"), debt3)

      const totalDebt = await activePool.getDebt()

      // Total debt includes principal + fees + gas compensation for each trove
      const expectedMinDebt = debt1 + debt2 + debt3 + MUSD_GAS_COMPENSATION * 3n
      expect(totalDebt).to.be.gte(expectedMinDebt)
    })

    it("allows multiple users to adjust troves simultaneously", async () => {
      // Open troves
      await openTrove(alice, to1e18("5"), to1e18("20000"))
      await openTrove(bob, to1e18("5"), to1e18("20000"))
      await openTrove(carol, to1e18("5"), to1e18("20000"))

      // All users add collateral
      const addAmount = to1e18("1")

      await collateralToken
        .connect(alice)
        .approve(await borrowerOperations.getAddress(), addAmount)
      await collateralToken
        .connect(bob)
        .approve(await borrowerOperations.getAddress(), addAmount)
      await collateralToken
        .connect(carol)
        .approve(await borrowerOperations.getAddress(), addAmount)

      await borrowerOperations
        .connect(alice)
        .addColl(addAmount, ZERO_ADDRESS, ZERO_ADDRESS)
      await borrowerOperations
        .connect(bob)
        .addColl(addAmount, ZERO_ADDRESS, ZERO_ADDRESS)
      await borrowerOperations
        .connect(carol)
        .addColl(addAmount, ZERO_ADDRESS, ZERO_ADDRESS)

      // Check all troves were updated
      expect((await troveManager.Troves(alice.address)).coll).to.equal(
        to1e18("6"),
      )
      expect((await troveManager.Troves(bob.address)).coll).to.equal(
        to1e18("6"),
      )
      expect((await troveManager.Troves(carol.address)).coll).to.equal(
        to1e18("6"),
      )
    })
  })

  describe("Stability Pool Integration", () => {
    it("allows deposits to StabilityPool", async () => {
      // Open trove to get mUSD
      await openTrove(alice, to1e18("5"), to1e18("50000"))

      // Approve and deposit to stability pool
      const depositAmount = to1e18("10000")
      await musd
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)

      await stabilityPool.connect(alice).provideToSP(depositAmount)

      expect(await stabilityPool.getTotalMUSDDeposits()).to.equal(depositAmount)
      expect(await stabilityPool.getCompoundedMUSDDeposit(alice.address)).to.equal(
        depositAmount,
      )
    })

    it("allows withdrawals from StabilityPool", async () => {
      // Setup
      await openTrove(alice, to1e18("5"), to1e18("50000"))
      await openTrove(bob, to1e18("5"), to1e18("50000"))

      const depositAmount = to1e18("10000")
      await musd
        .connect(alice)
        .approve(await stabilityPool.getAddress(), depositAmount)
      await stabilityPool.connect(alice).provideToSP(depositAmount)

      // Withdraw
      const withdrawAmount = to1e18("5000")
      const musdBefore = await musd.balanceOf(alice.address)

      await stabilityPool.connect(alice).withdrawFromSP(withdrawAmount)

      const musdAfter = await musd.balanceOf(alice.address)
      expect(musdAfter - musdBefore).to.equal(withdrawAmount)
    })
  })

  describe("Price Feed Integration", () => {
    it("uses price feed for ICR calculations", async () => {
      // Open trove at $60,000 price
      await openTrove(alice, to1e18("2"), to1e18("10000"))

      // Check ICR
      const price = await priceFeed.fetchPrice()
      expect(price).to.equal(to1e18("60000"))

      const icr = await troveManager.getCurrentICR(alice.address, price)
      // ICR should be around (2 * 60000) / (10000 + fees + gas comp)
      expect(icr).to.be.gt(to1e18("10")) // > 1000%
    })

    it("responds to price changes", async () => {
      await openTrove(alice, to1e18("2"), to1e18("10000"))

      // Get initial ICR
      const priceBefore = await priceFeed.fetchPrice()
      const icrBefore = await troveManager.getCurrentICR(
        alice.address,
        priceBefore,
      )

      // Drop price by 50%
      await mockAggregator.setPrice(30000n * 10n ** 8n)

      // Get new ICR
      const priceAfter = await priceFeed.fetchPrice()
      const icrAfter = await troveManager.getCurrentICR(
        alice.address,
        priceAfter,
      )

      expect(priceAfter).to.equal(to1e18("30000"))
      expect(icrAfter).to.be.lt(icrBefore)
      // ICR should be roughly half of before
      expect(icrAfter).to.be.closeTo(icrBefore / 2n, to1e18("0.1"))
    })
  })

  describe("TCR (Total Collateral Ratio)", () => {
    it("calculates system TCR correctly", async () => {
      await openTrove(alice, to1e18("2"), to1e18("10000"))
      await openTrove(bob, to1e18("3"), to1e18("20000"))

      const price = await priceFeed.fetchPrice()
      const tcr = await troveManager.getTCR(price)

      // TCR = (total coll * price) / total debt
      // (5 * 60000) / (30000 + fees + gas) should be > 900%
      expect(tcr).to.be.gt(to1e18("9"))
    })

    it("detects recovery mode when TCR < CCR", async () => {
      // Open trove with moderately high debt
      // 3 BTC at $60k = $180,000 collateral
      // $50,000 debt gives ICR = 360%, TCR starts healthy
      await openTrove(alice, to1e18("3"), to1e18("50000"))

      // Verify system is NOT in recovery mode initially
      const priceBefore = await priceFeed.fetchPrice()
      const isRecoveryModeBefore = await troveManager.checkRecoveryMode(priceBefore)
      expect(isRecoveryModeBefore).to.be.false

      // Drop price significantly to trigger recovery mode
      // At $20k price: collateral value = $60,000, debt = ~$50,200
      // TCR = 60,000 / 50,200 = 119.5% < CCR (150%)
      await mockAggregator.setPrice(20000n * 10n ** 8n)

      const priceAfter = await priceFeed.fetchPrice()
      const isRecoveryModeAfter = await troveManager.checkRecoveryMode(priceAfter)

      // System should now be in recovery mode
      expect(isRecoveryModeAfter).to.be.true
    })
  })

  describe("Fee Collection", () => {
    it("collects borrowing fees to PCV", async () => {
      const pcvBalanceBefore = await musd.balanceOf(await pcv.getAddress())

      await openTrove(alice, to1e18("2"), to1e18("10000"))

      const pcvBalanceAfter = await musd.balanceOf(await pcv.getAddress())

      // PCV should have received the borrowing fee
      expect(pcvBalanceAfter).to.be.gt(pcvBalanceBefore)

      // Fee should be ~0.5% of 10000 = 50 mUSD
      expect(pcvBalanceAfter - pcvBalanceBefore).to.be.closeTo(
        to1e18("50"),
        to1e18("1"),
      )
    })

    it("collects fees from multiple troves", async () => {
      const pcvBalanceBefore = await musd.balanceOf(await pcv.getAddress())

      await openTrove(alice, to1e18("2"), to1e18("10000"))
      await openTrove(bob, to1e18("3"), to1e18("20000"))
      await openTrove(carol, to1e18("4"), to1e18("30000"))

      const pcvBalanceAfter = await musd.balanceOf(await pcv.getAddress())

      // Total fees should be ~0.5% of (10000 + 20000 + 30000) = ~300 mUSD
      expect(pcvBalanceAfter - pcvBalanceBefore).to.be.closeTo(
        to1e18("300"),
        to1e18("5"),
      )
    })
  })

  describe("Gas Pool", () => {
    it("receives gas compensation on trove opening", async () => {
      const gasPoolBalanceBefore = await musd.balanceOf(
        await gasPool.getAddress(),
      )

      await openTrove(alice, to1e18("2"), to1e18("10000"))

      const gasPoolBalanceAfter = await musd.balanceOf(
        await gasPool.getAddress(),
      )

      // Gas pool should receive 200 mUSD per trove
      expect(gasPoolBalanceAfter - gasPoolBalanceBefore).to.equal(
        MUSD_GAS_COMPENSATION,
      )
    })

    it("accumulates gas compensation from multiple troves", async () => {
      const gasPoolBalanceBefore = await musd.balanceOf(
        await gasPool.getAddress(),
      )

      await openTrove(alice, to1e18("2"), to1e18("10000"))
      await openTrove(bob, to1e18("3"), to1e18("20000"))
      await openTrove(carol, to1e18("4"), to1e18("30000"))

      const gasPoolBalanceAfter = await musd.balanceOf(
        await gasPool.getAddress(),
      )

      // 3 troves * 200 mUSD = 600 mUSD
      expect(gasPoolBalanceAfter - gasPoolBalanceBefore).to.equal(
        MUSD_GAS_COMPENSATION * 3n,
      )
    })
  })
})
