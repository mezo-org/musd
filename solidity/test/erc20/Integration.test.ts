import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import type {
  ActivePoolERC20,
  BorrowerOperationsERC20,
  CollSurplusPoolERC20,
  DefaultPoolERC20,
  GasPool,
  GovernableVariables,
  HintHelpers,
  InterestRateManager,
  MockAggregator,
  MockERC20,
  MUSDTester,
  PCVERC20,
  PriceFeed,
  SortedTroves,
  StabilityPoolERC20,
  TroveManagerERC20,
} from "../../typechain-types"

describe("ERC20 Integration Tests", () => {
  let activePoolERC20: ActivePoolERC20
  let borrowerOpsERC20: BorrowerOperationsERC20
  let collSurplusPoolERC20: CollSurplusPoolERC20
  let defaultPoolERC20: DefaultPoolERC20
  let gasPool: GasPool
  let governableVariables: GovernableVariables
  let hintHelpers: HintHelpers
  let interestRateManager: InterestRateManager
  let mockAggregator: MockAggregator
  let mockToken: MockERC20
  let musd: MUSDTester
  let pcvERC20: PCVERC20
  let priceFeed: PriceFeed
  let sortedTroves: SortedTroves
  let stabilityPoolERC20: StabilityPoolERC20
  let troveManagerERC20: TroveManagerERC20

  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let dennis: HardhatEthersSigner
  let council: HardhatEthersSigner
  let treasury: HardhatEthersSigner

  const DECIMAL_PRECISION = ethers.parseEther("1")
  const MIN_NET_DEBT = ethers.parseEther("1800")
  const MUSD_GAS_COMPENSATION = ethers.parseEther("200")
  const MCR = ethers.parseEther("1.1") // 110%
  const CCR = ethers.parseEther("1.5") // 150%
  const BOOTSTRAP_LOAN = ethers.parseUnits("100000000", 18) // 100M mUSD
  const INITIAL_PRICE = ethers.parseEther("50000") // $50,000 per BTC

  async function deployFixture() {
    const signers = await ethers.getSigners()
    ;[deployer, alice, bob, carol, dennis, council, treasury] = signers

    // Deploy mock ERC20 token (18 decimals)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    const token = await MockERC20Factory.deploy("Mock BTC", "MBTC", 18)

    // Deploy supporting contracts (shared with native version)
    const MockAggregatorFactory =
      await ethers.getContractFactory("MockAggregator")
    const aggregator = await MockAggregatorFactory.deploy(8) // 8 decimals for price feed

    const PriceFeedFactory = await ethers.getContractFactory("PriceFeed")
    const feed = (await upgrades.deployProxy(PriceFeedFactory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as PriceFeed

    const MUSDFactory = await ethers.getContractFactory("MUSDTester")
    const musdToken = await MUSDFactory.deploy()

    const SortedTrovesFactory = await ethers.getContractFactory("SortedTroves")
    const sorted = (await upgrades.deployProxy(SortedTrovesFactory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as SortedTroves

    const GasPoolFactory = await ethers.getContractFactory("GasPool")
    const gas = await GasPoolFactory.deploy()

    const GovernableVariablesFactory = await ethers.getContractFactory(
      "GovernableVariables",
    )
    const govVars = (await upgrades.deployProxy(
      GovernableVariablesFactory,
      [0], // governance time delay
      {
        kind: "transparent",
        unsafeSkipStorageCheck: true,
      },
    )) as unknown as GovernableVariables

    const InterestRateManagerFactory = await ethers.getContractFactory(
      "InterestRateManager",
    )
    const irm = (await upgrades.deployProxy(InterestRateManagerFactory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as InterestRateManager

    const HintHelpersFactory = await ethers.getContractFactory("HintHelpers")
    const hints = (await upgrades.deployProxy(HintHelpersFactory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as HintHelpers

    // Deploy ERC20 contracts
    const ActivePoolERC20Factory =
      await ethers.getContractFactory("ActivePoolERC20")
    const activePool = (await upgrades.deployProxy(ActivePoolERC20Factory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as ActivePoolERC20

    const DefaultPoolERC20Factory =
      await ethers.getContractFactory("DefaultPoolERC20")
    const defaultPool = (await upgrades.deployProxy(
      DefaultPoolERC20Factory,
      [],
      {
        kind: "transparent",
        unsafeSkipStorageCheck: true,
      },
    )) as unknown as DefaultPoolERC20

    const CollSurplusPoolERC20Factory = await ethers.getContractFactory(
      "CollSurplusPoolERC20",
    )
    const collSurplusPool = (await upgrades.deployProxy(
      CollSurplusPoolERC20Factory,
      [],
      {
        kind: "transparent",
        unsafeSkipStorageCheck: true,
      },
    )) as unknown as CollSurplusPoolERC20

    const StabilityPoolERC20Factory = await ethers.getContractFactory(
      "StabilityPoolERC20",
    )
    const stabilityPool = (await upgrades.deployProxy(
      StabilityPoolERC20Factory,
      [],
      {
        kind: "transparent",
        unsafeSkipStorageCheck: true,
      },
    )) as unknown as StabilityPoolERC20

    const TroveManagerERC20Factory = await ethers.getContractFactory(
      "TroveManagerERC20",
    )
    const troveMgr = (await upgrades.deployProxy(TroveManagerERC20Factory, [], {
      kind: "transparent",
      unsafeSkipStorageCheck: true,
    })) as unknown as TroveManagerERC20

    const BorrowerOperationsERC20Factory = await ethers.getContractFactory(
      "BorrowerOperationsERC20",
    )
    const borrowerOps = (await upgrades.deployProxy(
      BorrowerOperationsERC20Factory,
      [],
      {
        kind: "transparent",
        unsafeSkipStorageCheck: true,
      },
    )) as unknown as BorrowerOperationsERC20

    const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
    const pcv = (await upgrades.deployProxy(
      PCVERC20Factory,
      [0], // governance time delay
      {
        kind: "transparent",
        unsafeSkipStorageCheck: true,
      },
    )) as unknown as PCVERC20

    // Set mock price
    await aggregator.setPrice(INITIAL_PRICE)

    // Set price feed oracle
    await feed.connect(deployer).setOracle(await aggregator.getAddress())

    // Set addresses for all contracts
    const tokenAddr = await token.getAddress()
    const activePoolAddr = await activePool.getAddress()
    const borrowerOpsAddr = await borrowerOps.getAddress()
    const collSurplusPoolAddr = await collSurplusPool.getAddress()
    const defaultPoolAddr = await defaultPool.getAddress()
    const gasPoolAddr = await gas.getAddress()
    const govVarsAddr = await govVars.getAddress()
    const irmAddr = await irm.getAddress()
    const musdAddr = await musdToken.getAddress()
    const pcvAddr = await pcv.getAddress()
    const feedAddr = await feed.getAddress()
    const sortedAddr = await sorted.getAddress()
    const stabilityPoolAddr = await stabilityPool.getAddress()
    const troveMgrAddr = await troveMgr.getAddress()
    const hintsAddr = await hints.getAddress()

    // ActivePoolERC20.setAddresses
    await activePool.setAddresses(
      tokenAddr,
      borrowerOpsAddr,
      collSurplusPoolAddr,
      defaultPoolAddr,
      irmAddr,
      stabilityPoolAddr,
      troveMgrAddr,
    )

    // DefaultPoolERC20.setAddresses
    await defaultPool.setAddresses(tokenAddr, activePoolAddr, troveMgrAddr)

    // CollSurplusPoolERC20.setAddresses
    await collSurplusPool.setAddresses(
      tokenAddr,
      activePoolAddr,
      borrowerOpsAddr,
      troveMgrAddr,
    )

    // StabilityPoolERC20.setAddresses
    await stabilityPool.setAddresses(
      tokenAddr,
      activePoolAddr,
      borrowerOpsAddr,
      musdAddr,
      feedAddr,
      sortedAddr,
      troveMgrAddr,
    )

    // TroveManagerERC20.setAddresses (use the ERC20 version with collateralToken)
    await troveMgr["setAddresses(address,address,address,address,address,address,address,address,address,address,address,address)"](
      tokenAddr,
      activePoolAddr,
      borrowerOpsAddr,
      collSurplusPoolAddr,
      defaultPoolAddr,
      gasPoolAddr,
      irmAddr,
      musdAddr,
      pcvAddr,
      feedAddr,
      sortedAddr,
      stabilityPoolAddr,
    )

    // BorrowerOperationsERC20.setAddresses
    await borrowerOps.setAddresses([
      tokenAddr,
      activePoolAddr,
      defaultPoolAddr,
      stabilityPoolAddr,
      gasPoolAddr,
      collSurplusPoolAddr,
      feedAddr,
      sortedAddr,
      musdAddr,
      troveMgrAddr,
      irmAddr,
      govVarsAddr,
      pcvAddr,
    ])

    // PCVERC20.setAddresses
    await pcv.setAddresses(tokenAddr, borrowerOpsAddr, musdAddr)

    // InterestRateManager.setAddresses
    await irm.setAddresses(
      activePoolAddr,
      borrowerOpsAddr,
      defaultPoolAddr,
      stabilityPoolAddr,
      troveMgrAddr,
    )

    // SortedTroves.setParams
    await sorted.setParams(1000, borrowerOpsAddr, troveMgrAddr) // maxSize = 1000

    // HintHelpers.setAddresses
    await hints.setAddresses(borrowerOpsAddr, sortedAddr, troveMgrAddr)

    // Initialize MUSD (this also adds borrowerOps to mint list)
    await musdToken.initialize(
      troveMgrAddr,
      stabilityPoolAddr,
      borrowerOpsAddr,
      irmAddr,
    )

    // Add PCV to mint list
    await musdToken.addToMintList(pcvAddr)

    // Mint tokens to users
    const userAmount = ethers.parseEther("10000")
    await token.mint(alice.address, userAmount)
    await token.mint(bob.address, userAmount)
    await token.mint(carol.address, userAmount)
    await token.mint(dennis.address, userAmount)

    return {
      token,
      aggregator,
      feed,
      musdToken,
      sorted,
      gas,
      govVars,
      irm,
      hints,
      activePool,
      defaultPool,
      collSurplusPool,
      stabilityPool,
      troveMgr,
      borrowerOps,
      pcv,
    }
  }

  beforeEach(async () => {
    const fixture = await deployFixture()
    mockToken = fixture.token
    mockAggregator = fixture.aggregator
    priceFeed = fixture.feed
    musd = fixture.musdToken
    sortedTroves = fixture.sorted
    gasPool = fixture.gas
    governableVariables = fixture.govVars
    interestRateManager = fixture.irm
    hintHelpers = fixture.hints
    activePoolERC20 = fixture.activePool
    defaultPoolERC20 = fixture.defaultPool
    collSurplusPoolERC20 = fixture.collSurplusPool
    stabilityPoolERC20 = fixture.stabilityPool
    troveManagerERC20 = fixture.troveMgr
    borrowerOpsERC20 = fixture.borrowerOps
    pcvERC20 = fixture.pcv
  })

  describe("1. Full System Deployment", () => {
    it("should deploy all ERC20 contracts successfully", async () => {
      expect(await activePoolERC20.getAddress()).to.not.equal(
        ethers.ZeroAddress,
      )
      expect(await borrowerOpsERC20.getAddress()).to.not.equal(
        ethers.ZeroAddress,
      )
      expect(await collSurplusPoolERC20.getAddress()).to.not.equal(
        ethers.ZeroAddress,
      )
      expect(await defaultPoolERC20.getAddress()).to.not.equal(
        ethers.ZeroAddress,
      )
      expect(await stabilityPoolERC20.getAddress()).to.not.equal(
        ethers.ZeroAddress,
      )
      expect(await troveManagerERC20.getAddress()).to.not.equal(
        ethers.ZeroAddress,
      )
      expect(await pcvERC20.getAddress()).to.not.equal(ethers.ZeroAddress)
    })

    it("should initialize all contracts with correct addresses", async () => {
      const tokenAddr = await mockToken.getAddress()
      expect(await borrowerOpsERC20.collateralToken()).to.equal(tokenAddr)
      expect(await activePoolERC20.collateralToken()).to.equal(tokenAddr)
      expect(await stabilityPoolERC20.collateralToken()).to.equal(tokenAddr)
      expect(await troveManagerERC20.collateralToken()).to.equal(tokenAddr)
      expect(await pcvERC20.collateralToken()).to.equal(tokenAddr)
    })

    it("should initialize PCV with bootstrap loan", async () => {
      const pcvAddr = await pcvERC20.getAddress()

      // PCV should start with no MUSD (bootstrap loan not deposited yet)
      expect(await musd.balanceOf(pcvAddr)).to.equal(0)

      // Initialize PCV bootstrap loan (this would normally be done in deployment)
      await pcvERC20.initializeBootstrapLoan()

      // PCV should now have bootstrap loan debt
      expect(await pcvERC20.debtToPay()).to.equal(BOOTSTRAP_LOAN)
      expect(await pcvERC20.isInitialized()).to.equal(true)

      // StabilityPool should have bootstrap loan deposited
      const spBalance = await musd.balanceOf(
        await stabilityPoolERC20.getAddress(),
      )
      expect(spBalance).to.equal(BOOTSTRAP_LOAN)
    })
  })

  describe("2. Trove Lifecycle", () => {
    let collateralAmount: bigint
    let musdAmount: bigint

    beforeEach(async () => {
      await pcvERC20.initializeBootstrapLoan()

      // Calculate amounts for 200% ICR
      musdAmount = ethers.parseEther("5000")
      const price = await priceFeed.fetchPrice()

      // Get total debt including fees
      const borrowingFee = await borrowerOpsERC20.getBorrowingFee(musdAmount)
      const compositeDebt =
        await troveManagerERC20.getCompositeDebt(musdAmount)
      const totalDebt = compositeDebt + borrowingFee

      // Calculate collateral for 200% ICR
      const icr = ethers.parseEther("2") // 200%
      collateralAmount = (totalDebt * icr) / price
    })

    it("should open trove with ERC20 collateral", async () => {
      // Approve collateral
      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), collateralAmount)

      // Check balances before
      const tokenBalBefore = await mockToken.balanceOf(alice.address)
      const musdBalBefore = await musd.balanceOf(alice.address)

      // Open trove
      const tx = await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          collateralAmount,
          musdAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      await expect(tx).to.emit(borrowerOpsERC20, "TroveCreated")

      // Check trove state
      const [coll, principal, interest, , status] =
        await troveManagerERC20.Troves(alice.address)
      expect(status).to.equal(1) // Status.active
      expect(coll).to.equal(collateralAmount)
      expect(principal).to.be.gt(0)

      // Check token balances
      const tokenBalAfter = await mockToken.balanceOf(alice.address)
      const musdBalAfter = await musd.balanceOf(alice.address)

      expect(tokenBalBefore - tokenBalAfter).to.equal(collateralAmount)
      expect(musdBalAfter - musdBalBefore).to.equal(musdAmount)

      // Check active pool has collateral
      const activePoolColl = await activePoolERC20.getCollateralBalance()
      expect(activePoolColl).to.equal(collateralAmount)

      // Verify ERC20 token is in ActivePool
      const activePoolTokenBal = await mockToken.balanceOf(
        await activePoolERC20.getAddress(),
      )
      expect(activePoolTokenBal).to.equal(collateralAmount)
    })

    it("should add collateral to existing trove", async () => {
      // Open trove first
      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), collateralAmount)
      await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          collateralAmount,
          musdAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const [collBefore] = await troveManagerERC20.Troves(alice.address)

      // Add more collateral
      const addAmount = ethers.parseEther("0.1")
      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), addAmount)
      await borrowerOpsERC20.connect(alice).addColl(addAmount)

      const [collAfter] = await troveManagerERC20.Troves(alice.address)
      expect(collAfter - collBefore).to.equal(addAmount)
    })

    it("should borrow more MUSD", async () => {
      // Open trove first
      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), collateralAmount)
      await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          collateralAmount,
          musdAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const musdBalBefore = await musd.balanceOf(alice.address)
      const [, principalBefore] = await troveManagerERC20.Troves(alice.address)

      // Borrow more
      const borrowAmount = ethers.parseEther("1000")
      await borrowerOpsERC20.connect(alice).withdrawMUSD(borrowAmount)

      const musdBalAfter = await musd.balanceOf(alice.address)
      const [, principalAfter] = await troveManagerERC20.Troves(alice.address)

      expect(musdBalAfter - musdBalBefore).to.equal(borrowAmount)
      expect(principalAfter).to.be.gt(principalBefore)
    })

    it("should repay debt", async () => {
      // Open trove first
      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), collateralAmount)
      await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          collateralAmount,
          musdAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const musdBalBefore = await musd.balanceOf(alice.address)
      const [, principalBefore] = await troveManagerERC20.Troves(alice.address)

      // Repay some debt
      const repayAmount = ethers.parseEther("1000")
      await musd
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), repayAmount)
      await borrowerOpsERC20.connect(alice).repayMUSD(repayAmount)

      const musdBalAfter = await musd.balanceOf(alice.address)
      const [, principalAfter] = await troveManagerERC20.Troves(alice.address)

      expect(musdBalBefore - musdBalAfter).to.equal(repayAmount)
      expect(principalBefore - principalAfter).to.be.gt(0)
    })

    it("should withdraw collateral", async () => {
      // Open trove first
      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), collateralAmount)
      await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          collateralAmount,
          musdAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      const tokenBalBefore = await mockToken.balanceOf(alice.address)
      const [collBefore] = await troveManagerERC20.Troves(alice.address)

      // Withdraw some collateral
      const withdrawAmount = ethers.parseEther("0.1")
      await borrowerOpsERC20.connect(alice).withdrawColl(withdrawAmount)

      const tokenBalAfter = await mockToken.balanceOf(alice.address)
      const [collAfter] = await troveManagerERC20.Troves(alice.address)

      expect(tokenBalAfter - tokenBalBefore).to.equal(withdrawAmount)
      expect(collBefore - collAfter).to.equal(withdrawAmount)
    })

    it("should close trove", async () => {
      // Open trove first
      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), collateralAmount)
      await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          collateralAmount,
          musdAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Get entire debt
      const { principal, interest } =
        await troveManagerERC20.getEntireDebtAndColl(alice.address)
      const totalDebt = principal + interest

      // Approve MUSD for repayment
      await musd
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), totalDebt)

      const tokenBalBefore = await mockToken.balanceOf(alice.address)

      // Close trove
      const tx = await borrowerOpsERC20.connect(alice).closeTrove()
      await expect(tx).to.emit(borrowerOpsERC20, "TroveUpdated")

      // Check trove is closed
      const [, , , , status] = await troveManagerERC20.Troves(alice.address)
      expect(status).to.equal(2) // Status.closedByOwner

      // Check collateral was returned (minus gas compensation)
      const tokenBalAfter = await mockToken.balanceOf(alice.address)
      expect(tokenBalAfter).to.be.gt(tokenBalBefore)
    })
  })

  describe("3. Stability Pool", () => {
    let collateralAmount: bigint
    let musdAmount: bigint

    beforeEach(async () => {
      await pcvERC20.initializeBootstrapLoan()

      musdAmount = ethers.parseEther("10000")
      const price = await priceFeed.fetchPrice()
      const borrowingFee = await borrowerOpsERC20.getBorrowingFee(musdAmount)
      const compositeDebt =
        await troveManagerERC20.getCompositeDebt(musdAmount)
      const totalDebt = compositeDebt + borrowingFee
      const icr = ethers.parseEther("3") // 300% ICR for safety
      collateralAmount = (totalDebt * icr) / price

      // Open trove for Bob
      await mockToken
        .connect(bob)
        .approve(await borrowerOpsERC20.getAddress(), collateralAmount)
      await borrowerOpsERC20
        .connect(bob)
        .openTrove(
          collateralAmount,
          musdAmount,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )
    })

    it("should deposit MUSD to stability pool", async () => {
      const depositAmount = ethers.parseEther("5000")

      // Approve MUSD
      await musd
        .connect(bob)
        .approve(await stabilityPoolERC20.getAddress(), depositAmount)

      const musdBalBefore = await musd.balanceOf(bob.address)
      const spBalBefore = await stabilityPoolERC20.getTotalMUSDDeposits()

      // Deposit to stability pool
      const tx = await stabilityPoolERC20
        .connect(bob)
        .provideToSP(depositAmount)
      await expect(tx).to.emit(stabilityPoolERC20, "UserDepositChanged")

      const musdBalAfter = await musd.balanceOf(bob.address)
      const spBalAfter = await stabilityPoolERC20.getTotalMUSDDeposits()

      expect(musdBalBefore - musdBalAfter).to.equal(depositAmount)
      expect(spBalAfter - spBalBefore).to.equal(depositAmount)

      // Check user deposit
      const userDeposit = await stabilityPoolERC20.deposits(bob.address)
      expect(userDeposit).to.equal(depositAmount)
    })

    it("should withdraw from stability pool", async () => {
      const depositAmount = ethers.parseEther("5000")

      // Deposit first
      await musd
        .connect(bob)
        .approve(await stabilityPoolERC20.getAddress(), depositAmount)
      await stabilityPoolERC20.connect(bob).provideToSP(depositAmount)

      // Withdraw
      const withdrawAmount = ethers.parseEther("2000")
      const musdBalBefore = await musd.balanceOf(bob.address)

      await stabilityPoolERC20.connect(bob).withdrawFromSP(withdrawAmount)

      const musdBalAfter = await musd.balanceOf(bob.address)
      const userDeposit = await stabilityPoolERC20.deposits(bob.address)

      expect(musdBalAfter - musdBalBefore).to.equal(withdrawAmount)
      expect(userDeposit).to.equal(depositAmount - withdrawAmount)
    })

    it("should track collateral gains", async () => {
      // This will be verified in the liquidation test
      const depositAmount = ethers.parseEther("5000")
      await musd
        .connect(bob)
        .approve(await stabilityPoolERC20.getAddress(), depositAmount)
      await stabilityPoolERC20.connect(bob).provideToSP(depositAmount)

      // Initially no gains
      const collGainBefore =
        await stabilityPoolERC20.getDepositorCollateralGain(bob.address)
      expect(collGainBefore).to.equal(0)
    })
  })

  describe("4. Liquidation Flow", () => {
    let aliceCollateral: bigint
    let bobCollateral: bigint
    let carolCollateral: bigint

    beforeEach(async () => {
      await pcvERC20.initializeBootstrapLoan()

      const price = await priceFeed.fetchPrice()

      // Bob opens a safe trove with high ICR and deposits to stability pool
      const bobMusd = ethers.parseEther("20000")
      const bobFee = await borrowerOpsERC20.getBorrowingFee(bobMusd)
      const bobComposite = await troveManagerERC20.getCompositeDebt(bobMusd)
      const bobTotalDebt = bobComposite + bobFee
      bobCollateral = (bobTotalDebt * ethers.parseEther("5")) / price // 500% ICR

      await mockToken
        .connect(bob)
        .approve(await borrowerOpsERC20.getAddress(), bobCollateral)
      await borrowerOpsERC20
        .connect(bob)
        .openTrove(
          bobCollateral,
          bobMusd,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Bob deposits to stability pool
      await musd
        .connect(bob)
        .approve(await stabilityPoolERC20.getAddress(), bobMusd)
      await stabilityPoolERC20.connect(bob).provideToSP(bobMusd)

      // Carol opens safe trove
      const carolMusd = ethers.parseEther("5000")
      const carolFee = await borrowerOpsERC20.getBorrowingFee(carolMusd)
      const carolComposite =
        await troveManagerERC20.getCompositeDebt(carolMusd)
      const carolTotalDebt = carolComposite + carolFee
      carolCollateral = (carolTotalDebt * ethers.parseEther("3")) / price // 300% ICR

      await mockToken
        .connect(carol)
        .approve(await borrowerOpsERC20.getAddress(), carolCollateral)
      await borrowerOpsERC20
        .connect(carol)
        .openTrove(
          carolCollateral,
          carolMusd,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Alice opens undercollateralized trove (will be liquidated)
      const aliceMusd = ethers.parseEther("5000")
      const aliceFee = await borrowerOpsERC20.getBorrowingFee(aliceMusd)
      const aliceComposite = await troveManagerERC20.getCompositeDebt(aliceMusd)
      const aliceTotalDebt = aliceComposite + aliceFee
      aliceCollateral = (aliceTotalDebt * ethers.parseEther("1.2")) / price // 120% ICR

      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), aliceCollateral)
      await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          aliceCollateral,
          aliceMusd,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )
    })

    it("should liquidate undercollateralized trove", async () => {
      // Verify Alice's trove is active
      let [, , , , status] = await troveManagerERC20.Troves(alice.address)
      expect(status).to.equal(1) // Status.active

      // Drop price to make Alice's trove undercollateralized
      const newPrice = (INITIAL_PRICE * 9n) / 10n // 90% of initial
      await mockAggregator.setPrice(newPrice)

      // Check ICR is now below MCR
      const icr = await troveManagerERC20.getCurrentICR(alice.address, newPrice)
      expect(icr).to.be.lt(MCR)

      // Get stability pool balance before
      const spBalBefore = await stabilityPoolERC20.getTotalMUSDDeposits()
      const spCollBefore = await stabilityPoolERC20.getCollateralBalance()

      // Liquidate Alice's trove
      const tx = await troveManagerERC20.connect(deployer).liquidate(alice.address)
      await expect(tx).to.emit(troveManagerERC20, "TroveLiquidated")

      // Verify Alice's trove is closed
      ;[, , , , status] = await troveManagerERC20.Troves(alice.address)
      expect(status).to.equal(3) // Status.closedByLiquidation

      // Verify stability pool absorbed the debt
      const spBalAfter = await stabilityPoolERC20.getTotalMUSDDeposits()
      expect(spBalAfter).to.be.lt(spBalBefore)

      // Verify stability pool received collateral
      const spCollAfter = await stabilityPoolERC20.getCollateralBalance()
      expect(spCollAfter).to.be.gt(spCollBefore)
    })

    it("should distribute collateral to stability pool depositors", async () => {
      // Drop price
      const newPrice = (INITIAL_PRICE * 9n) / 10n
      await mockAggregator.setPrice(newPrice)

      // Get Bob's collateral gain before
      const collGainBefore =
        await stabilityPoolERC20.getDepositorCollateralGain(bob.address)

      // Liquidate
      await troveManagerERC20.connect(deployer).liquidate(alice.address)

      // Check Bob's collateral gain increased
      const collGainAfter =
        await stabilityPoolERC20.getDepositorCollateralGain(bob.address)
      expect(collGainAfter).to.be.gt(collGainBefore)
      expect(collGainAfter).to.be.gt(0)

      // Bob can withdraw collateral gain
      const tokenBalBefore = await mockToken.balanceOf(bob.address)
      await stabilityPoolERC20
        .connect(bob)
        .withdrawCollateralGainToTrove(ethers.ZeroAddress, ethers.ZeroAddress)

      const tokenBalAfter = await mockToken.balanceOf(bob.address)
      expect(tokenBalAfter - tokenBalBefore).to.equal(collGainAfter)
    })

    it("should handle gas compensation", async () => {
      // Drop price
      const newPrice = (INITIAL_PRICE * 9n) / 10n
      await mockAggregator.setPrice(newPrice)

      // Liquidate and check gas compensation went to liquidator
      const deployerBalBefore = await mockToken.balanceOf(deployer.address)

      await troveManagerERC20.connect(deployer).liquidate(alice.address)

      const deployerBalAfter = await mockToken.balanceOf(deployer.address)

      // Gas compensation should be non-zero
      const gasCompensation = deployerBalAfter - deployerBalBefore
      expect(gasCompensation).to.be.gt(0)
    })
  })

  describe("5. Redemption Flow", () => {
    beforeEach(async () => {
      await pcvERC20.initializeBootstrapLoan()

      const price = await priceFeed.fetchPrice()

      // Open troves with different ICRs
      // Alice: 150% ICR (lowest)
      const aliceMusd = ethers.parseEther("5000")
      const aliceFee = await borrowerOpsERC20.getBorrowingFee(aliceMusd)
      const aliceComposite = await troveManagerERC20.getCompositeDebt(aliceMusd)
      const aliceTotalDebt = aliceComposite + aliceFee
      const aliceCollateral =
        (aliceTotalDebt * ethers.parseEther("1.5")) / price

      await mockToken
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), aliceCollateral)
      await borrowerOpsERC20
        .connect(alice)
        .openTrove(
          aliceCollateral,
          aliceMusd,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Bob: 200% ICR
      const bobMusd = ethers.parseEther("5000")
      const bobFee = await borrowerOpsERC20.getBorrowingFee(bobMusd)
      const bobComposite = await troveManagerERC20.getCompositeDebt(bobMusd)
      const bobTotalDebt = bobComposite + bobFee
      const bobCollateral = (bobTotalDebt * ethers.parseEther("2")) / price

      await mockToken
        .connect(bob)
        .approve(await borrowerOpsERC20.getAddress(), bobCollateral)
      await borrowerOpsERC20
        .connect(bob)
        .openTrove(
          bobCollateral,
          bobMusd,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Carol: 300% ICR (highest) - will use for redemption
      const carolMusd = ethers.parseEther("10000")
      const carolFee = await borrowerOpsERC20.getBorrowingFee(carolMusd)
      const carolComposite = await troveManagerERC20.getCompositeDebt(carolMusd)
      const carolTotalDebt = carolComposite + carolFee
      const carolCollateral = (carolTotalDebt * ethers.parseEther("3")) / price

      await mockToken
        .connect(carol)
        .approve(await borrowerOpsERC20.getAddress(), carolCollateral)
      await borrowerOpsERC20
        .connect(carol)
        .openTrove(
          carolCollateral,
          carolMusd,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )
    })

    it("should redeem MUSD for collateral from lowest ICR troves", async () => {
      const redeemAmount = ethers.parseEther("2000")

      // Get Alice's trove state before (should have lowest ICR)
      const [aliceCollBefore, alicePrincipalBefore] =
        await troveManagerERC20.Troves(alice.address)

      // Carol redeems MUSD
      await musd
        .connect(carol)
        .approve(await troveManagerERC20.getAddress(), redeemAmount)

      const carolTokenBalBefore = await mockToken.balanceOf(carol.address)
      const carolMusdBalBefore = await musd.balanceOf(carol.address)

      // Get price and hints for redemption
      const price = await priceFeed.fetchPrice()

      const tx = await troveManagerERC20
        .connect(carol)
        .redeemCollateral(
          redeemAmount,
          alice.address, // first redemption hint (lowest ICR)
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          0,
          price,
        )

      await expect(tx).to.emit(troveManagerERC20, "Redemption")

      // Check Carol received collateral
      const carolTokenBalAfter = await mockToken.balanceOf(carol.address)
      const carolMusdBalAfter = await musd.balanceOf(carol.address)

      expect(carolTokenBalAfter).to.be.gt(carolTokenBalBefore)
      expect(carolMusdBalBefore - carolMusdBalAfter).to.be.gt(0)

      // Check Alice's trove was affected (debt reduced)
      const [aliceCollAfter, alicePrincipalAfter] =
        await troveManagerERC20.Troves(alice.address)

      expect(aliceCollBefore - aliceCollAfter).to.be.gt(0)
      expect(alicePrincipalBefore - alicePrincipalAfter).to.be.gt(0)
    })

    it("should distribute redemption fees to PCV", async () => {
      const redeemAmount = ethers.parseEther("2000")

      // Get PCV collateral before
      const pcvCollBefore = await mockToken.balanceOf(
        await pcvERC20.getAddress(),
      )

      // Redeem
      await musd
        .connect(carol)
        .approve(await troveManagerERC20.getAddress(), redeemAmount)

      const price = await priceFeed.fetchPrice()
      await troveManagerERC20
        .connect(carol)
        .redeemCollateral(
          redeemAmount,
          alice.address,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          0,
          price,
        )

      // Check PCV received redemption fee (in collateral)
      const pcvCollAfter = await mockToken.balanceOf(
        await pcvERC20.getAddress(),
      )

      // Redemption fee should be sent to PCV
      expect(pcvCollAfter).to.be.gt(pcvCollBefore)
    })

    it("should handle partial trove redemption", async () => {
      // Redeem small amount
      const redeemAmount = ethers.parseEther("1000")

      const [aliceCollBefore, alicePrincipalBefore, , , statusBefore] =
        await troveManagerERC20.Troves(alice.address)

      await musd
        .connect(carol)
        .approve(await troveManagerERC20.getAddress(), redeemAmount)

      const price = await priceFeed.fetchPrice()
      await troveManagerERC20
        .connect(carol)
        .redeemCollateral(
          redeemAmount,
          alice.address,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          0,
          price,
        )

      // Alice's trove should still be active
      const [aliceCollAfter, alicePrincipalAfter, , , statusAfter] =
        await troveManagerERC20.Troves(alice.address)

      expect(statusBefore).to.equal(1) // active
      expect(statusAfter).to.equal(1) // still active
      expect(aliceCollBefore).to.be.gt(aliceCollAfter)
      expect(alicePrincipalBefore).to.be.gt(alicePrincipalAfter)
      expect(aliceCollAfter).to.be.gt(0) // still has collateral
      expect(alicePrincipalAfter).to.be.gt(0) // still has debt
    })
  })

  describe("6. End-to-End Integration", () => {
    it("should handle full protocol lifecycle", async () => {
      // Initialize PCV
      await pcvERC20.initializeBootstrapLoan()
      expect(await pcvERC20.isInitialized()).to.equal(true)

      const price = await priceFeed.fetchPrice()

      // Step 1: Multiple users open troves
      const users = [alice, bob, carol]
      const musdAmount = ethers.parseEther("5000")

      for (const user of users) {
        const fee = await borrowerOpsERC20.getBorrowingFee(musdAmount)
        const composite = await troveManagerERC20.getCompositeDebt(musdAmount)
        const totalDebt = composite + fee
        const collateral = (totalDebt * ethers.parseEther("2")) / price

        await mockToken
          .connect(user)
          .approve(await borrowerOpsERC20.getAddress(), collateral)
        await borrowerOpsERC20
          .connect(user)
          .openTrove(
            collateral,
            musdAmount,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          )
      }

      // Verify all troves are active
      for (const user of users) {
        const [, , , , status] = await troveManagerERC20.Troves(user.address)
        expect(status).to.equal(1)
      }

      // Step 2: Bob deposits to stability pool
      const depositAmount = ethers.parseEther("3000")
      await musd
        .connect(bob)
        .approve(await stabilityPoolERC20.getAddress(), depositAmount)
      await stabilityPoolERC20.connect(bob).provideToSP(depositAmount)

      const spDeposits = await stabilityPoolERC20.getTotalMUSDDeposits()
      expect(spDeposits).to.be.gt(depositAmount) // includes bootstrap loan

      // Step 3: Create undercollateralized position for Dennis
      const dennisMusd = ethers.parseEther("5000")
      const dennisFee = await borrowerOpsERC20.getBorrowingFee(dennisMusd)
      const dennisComposite =
        await troveManagerERC20.getCompositeDebt(dennisMusd)
      const dennisTotalDebt = dennisComposite + dennisFee
      const dennisCollateral =
        (dennisTotalDebt * ethers.parseEther("1.15")) / price

      await mockToken
        .connect(dennis)
        .approve(await borrowerOpsERC20.getAddress(), dennisCollateral)
      await borrowerOpsERC20
        .connect(dennis)
        .openTrove(
          dennisCollateral,
          dennisMusd,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
        )

      // Step 4: Price drop triggers liquidation
      const newPrice = (INITIAL_PRICE * 9n) / 10n
      await mockAggregator.setPrice(newPrice)

      const dennisIcr = await troveManagerERC20.getCurrentICR(
        dennis.address,
        newPrice,
      )
      expect(dennisIcr).to.be.lt(MCR)

      // Liquidate Dennis
      await troveManagerERC20.connect(deployer).liquidate(dennis.address)

      // Verify liquidation
      const [, , , , dennisStatus] = await troveManagerERC20.Troves(
        dennis.address,
      )
      expect(dennisStatus).to.equal(3) // closedByLiquidation

      // Step 5: Bob gains collateral from liquidation
      const bobCollGain =
        await stabilityPoolERC20.getDepositorCollateralGain(bob.address)
      expect(bobCollGain).to.be.gt(0)

      // Step 6: Carol redeems MUSD
      const redeemAmount = ethers.parseEther("1000")
      await musd
        .connect(carol)
        .approve(await troveManagerERC20.getAddress(), redeemAmount)

      const carolTokenBalBefore = await mockToken.balanceOf(carol.address)

      await troveManagerERC20
        .connect(carol)
        .redeemCollateral(
          redeemAmount,
          alice.address,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          0,
          newPrice,
        )

      const carolTokenBalAfter = await mockToken.balanceOf(carol.address)
      expect(carolTokenBalAfter).to.be.gt(carolTokenBalBefore)

      // Step 7: Alice closes trove
      const { principal, interest } =
        await troveManagerERC20.getEntireDebtAndColl(alice.address)
      const aliceTotalDebt = principal + interest

      await musd
        .connect(alice)
        .approve(await borrowerOpsERC20.getAddress(), aliceTotalDebt)

      await borrowerOpsERC20.connect(alice).closeTrove()

      const [, , , , aliceStatus] = await troveManagerERC20.Troves(
        alice.address,
      )
      expect(aliceStatus).to.equal(2) // closedByOwner

      // Step 8: Verify system invariants
      const totalColl = await activePoolERC20.getCollateralBalance()
      const totalDebt = await activePoolERC20.getDebt()

      // TCR should be healthy
      const tcr = await troveManagerERC20.getTCR(newPrice)
      expect(tcr).to.be.gt(CCR)

      // ERC20 token balance should match active pool collateral
      const activePoolTokenBal = await mockToken.balanceOf(
        await activePoolERC20.getAddress(),
      )
      expect(activePoolTokenBal).to.equal(totalColl)
    })
  })
})
