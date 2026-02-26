import { expect } from "chai"
import { ethers, network } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { to1e18 } from "../utils"
import {
  ActivePoolERC20,
  MockERC20,
  InterestRateManager,
  DefaultPoolERC20,
  BorrowerOperationsERC20,
  StabilityPoolERC20,
  TroveManagerERC20,
  CollSurplusPoolERC20,
} from "../../typechain"

describe("ActivePoolERC20", () => {
  let activePool: ActivePoolERC20
  let collateralToken: MockERC20
  let interestRateManager: InterestRateManager
  let defaultPool: DefaultPoolERC20
  let borrowerOperations: BorrowerOperationsERC20
  let stabilityPool: StabilityPoolERC20
  let troveManager: TroveManagerERC20
  let collSurplusPool: CollSurplusPoolERC20

  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner

  let borrowerOperationsSigner: HardhatEthersSigner
  let troveManagerSigner: HardhatEthersSigner
  let stabilityPoolSigner: HardhatEthersSigner
  let defaultPoolSigner: HardhatEthersSigner

  async function deployFixture() {
    const signers = await ethers.getSigners()
    deployer = signers[0]
    alice = signers[1]
    bob = signers[2]

    // Deploy MockERC20 for collateral
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    collateralToken = await MockERC20Factory.deploy(
      "Test Collateral",
      "TCOLL",
      18,
    )

    // Deploy InterestRateManager (mock or real)
    const InterestRateManagerFactory =
      await ethers.getContractFactory("InterestRateManager")
    interestRateManager = await InterestRateManagerFactory.deploy()
    await interestRateManager.initialize()

    // Deploy ActivePoolERC20
    const ActivePoolFactory =
      await ethers.getContractFactory("ActivePoolERC20")
    activePool = (await ActivePoolFactory.deploy()) as ActivePoolERC20
    await activePool.initialize()

    // Deploy other required contracts for address setup
    const DefaultPoolFactory =
      await ethers.getContractFactory("DefaultPoolERC20")
    defaultPool = (await DefaultPoolFactory.deploy()) as DefaultPoolERC20
    await defaultPool.initialize()

    const BorrowerOperationsFactory = await ethers.getContractFactory(
      "BorrowerOperationsERC20",
    )
    borrowerOperations =
      (await BorrowerOperationsFactory.deploy()) as BorrowerOperationsERC20
    await borrowerOperations.initialize()

    const StabilityPoolFactory =
      await ethers.getContractFactory("StabilityPoolERC20")
    stabilityPool = (await StabilityPoolFactory.deploy()) as StabilityPoolERC20
    await stabilityPool.initialize()

    const TroveManagerFactory =
      await ethers.getContractFactory("TroveManagerERC20")
    troveManager = (await TroveManagerFactory.deploy()) as TroveManagerERC20
    await troveManager.initialize()

    const CollSurplusPoolFactory =
      await ethers.getContractFactory("CollSurplusPoolERC20")
    collSurplusPool =
      (await CollSurplusPoolFactory.deploy()) as CollSurplusPoolERC20
    await collSurplusPool.initialize()

    // Set addresses on ActivePool
    await activePool.setAddresses(
      await collateralToken.getAddress(),
      await borrowerOperations.getAddress(),
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await interestRateManager.getAddress(),
      await stabilityPool.getAddress(),
      await troveManager.getAddress(),
    )

    // Impersonate authorized contracts
    const boAddress = await borrowerOperations.getAddress()
    const tmAddress = await troveManager.getAddress()
    const spAddress = await stabilityPool.getAddress()
    const dpAddress = await defaultPool.getAddress()

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [boAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [tmAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [spAddress],
    })
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [dpAddress],
    })

    // Fund impersonated accounts for gas
    await deployer.sendTransaction({ to: boAddress, value: to1e18("1") })
    await deployer.sendTransaction({ to: tmAddress, value: to1e18("1") })
    await deployer.sendTransaction({ to: spAddress, value: to1e18("1") })
    await deployer.sendTransaction({ to: dpAddress, value: to1e18("1") })

    borrowerOperationsSigner = await ethers.getSigner(boAddress)
    troveManagerSigner = await ethers.getSigner(tmAddress)
    stabilityPoolSigner = await ethers.getSigner(spAddress)
    defaultPoolSigner = await ethers.getSigner(dpAddress)

    return {
      activePool,
      collateralToken,
      interestRateManager,
      defaultPool,
      borrowerOperations,
      stabilityPool,
      troveManager,
      collSurplusPool,
      deployer,
      alice,
      bob,
      borrowerOperationsSigner,
      troveManagerSigner,
      stabilityPoolSigner,
      defaultPoolSigner,
    }
  }

  beforeEach(async () => {
    const fixture = await loadFixture(deployFixture)
    activePool = fixture.activePool
    collateralToken = fixture.collateralToken
    interestRateManager = fixture.interestRateManager
    defaultPool = fixture.defaultPool
    borrowerOperations = fixture.borrowerOperations
    stabilityPool = fixture.stabilityPool
    troveManager = fixture.troveManager
    collSurplusPool = fixture.collSurplusPool
    deployer = fixture.deployer
    alice = fixture.alice
    bob = fixture.bob
    borrowerOperationsSigner = fixture.borrowerOperationsSigner
    troveManagerSigner = fixture.troveManagerSigner
    stabilityPoolSigner = fixture.stabilityPoolSigner
    defaultPoolSigner = fixture.defaultPoolSigner
  })

  describe("getCollateralBalance()", () => {
    it("returns 0 initially", async () => {
      expect(await activePool.getCollateralBalance()).to.equal(0)
    })
  })

  describe("getDebt()", () => {
    it("returns 0 initially", async () => {
      expect(await activePool.getDebt()).to.equal(0)
    })
  })

  describe("getPrincipal()", () => {
    it("returns 0 initially", async () => {
      expect(await activePool.getPrincipal()).to.equal(0)
    })
  })

  describe("getInterest()", () => {
    it("returns 0 initially", async () => {
      expect(await activePool.getInterest()).to.equal(0)
    })
  })

  describe("receiveCollateral()", () => {
    it("receives collateral from BorrowerOperations", async () => {
      const amount = to1e18("10")

      // Mint collateral to BorrowerOperations and approve
      await collateralToken.mint(
        await borrowerOperations.getAddress(),
        amount,
      )
      await collateralToken
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount)

      // Receive collateral
      await activePool
        .connect(borrowerOperationsSigner)
        .receiveCollateral(amount)

      expect(await activePool.getCollateralBalance()).to.equal(amount)
      expect(
        await collateralToken.balanceOf(await activePool.getAddress()),
      ).to.equal(amount)
    })

    it("receives collateral from DefaultPool", async () => {
      const amount = to1e18("5")

      // Mint collateral to DefaultPool and approve
      await collateralToken.mint(await defaultPool.getAddress(), amount)
      await collateralToken
        .connect(defaultPoolSigner)
        .approve(await activePool.getAddress(), amount)

      // Receive collateral
      await activePool.connect(defaultPoolSigner).receiveCollateral(amount)

      expect(await activePool.getCollateralBalance()).to.equal(amount)
    })

    it("emits ActivePoolCollateralBalanceUpdated event", async () => {
      const amount = to1e18("10")

      await collateralToken.mint(
        await borrowerOperations.getAddress(),
        amount,
      )
      await collateralToken
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount)

      await expect(
        activePool.connect(borrowerOperationsSigner).receiveCollateral(amount),
      )
        .to.emit(activePool, "ActivePoolCollateralBalanceUpdated")
        .withArgs(amount)
    })

    it("emits CollateralReceived event", async () => {
      const amount = to1e18("10")

      await collateralToken.mint(
        await borrowerOperations.getAddress(),
        amount,
      )
      await collateralToken
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount)

      await expect(
        activePool.connect(borrowerOperationsSigner).receiveCollateral(amount),
      )
        .to.emit(activePool, "CollateralReceived")
        .withArgs(await borrowerOperations.getAddress(), amount)
    })

    it("reverts when called by unauthorized address", async () => {
      await expect(
        activePool.connect(alice).receiveCollateral(to1e18("10")),
      ).to.be.revertedWith(
        "ActivePoolERC20: Caller is neither BO nor Default Pool",
      )
    })

    it("accumulates collateral over multiple deposits", async () => {
      const amount1 = to1e18("10")
      const amount2 = to1e18("5")

      // First deposit
      await collateralToken.mint(
        await borrowerOperations.getAddress(),
        amount1,
      )
      await collateralToken
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount1)
      await activePool
        .connect(borrowerOperationsSigner)
        .receiveCollateral(amount1)

      // Second deposit
      await collateralToken.mint(
        await borrowerOperations.getAddress(),
        amount2,
      )
      await collateralToken
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount2)
      await activePool
        .connect(borrowerOperationsSigner)
        .receiveCollateral(amount2)

      expect(await activePool.getCollateralBalance()).to.equal(
        amount1 + amount2,
      )
    })
  })

  describe("sendCollateral()", () => {
    beforeEach(async () => {
      // Setup: deposit some collateral first
      const amount = to1e18("100")
      await collateralToken.mint(
        await borrowerOperations.getAddress(),
        amount,
      )
      await collateralToken
        .connect(borrowerOperationsSigner)
        .approve(await activePool.getAddress(), amount)
      await activePool
        .connect(borrowerOperationsSigner)
        .receiveCollateral(amount)
    })

    it("sends collateral from BorrowerOperations", async () => {
      const sendAmount = to1e18("30")
      const balanceBefore = await activePool.getCollateralBalance()

      await activePool
        .connect(borrowerOperationsSigner)
        .sendCollateral(alice.address, sendAmount)

      expect(await activePool.getCollateralBalance()).to.equal(
        balanceBefore - sendAmount,
      )
      expect(await collateralToken.balanceOf(alice.address)).to.equal(
        sendAmount,
      )
    })

    it("sends collateral from TroveManager", async () => {
      const sendAmount = to1e18("20")

      await activePool
        .connect(troveManagerSigner)
        .sendCollateral(bob.address, sendAmount)

      expect(await collateralToken.balanceOf(bob.address)).to.equal(sendAmount)
    })

    it("sends collateral from StabilityPool", async () => {
      const sendAmount = to1e18("15")

      await activePool
        .connect(stabilityPoolSigner)
        .sendCollateral(alice.address, sendAmount)

      expect(await collateralToken.balanceOf(alice.address)).to.equal(
        sendAmount,
      )
    })

    it("emits ActivePoolCollateralBalanceUpdated event", async () => {
      const sendAmount = to1e18("10")
      const expectedBalance = to1e18("90") // 100 - 10

      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .sendCollateral(alice.address, sendAmount),
      )
        .to.emit(activePool, "ActivePoolCollateralBalanceUpdated")
        .withArgs(expectedBalance)
    })

    it("emits CollateralSent event", async () => {
      const sendAmount = to1e18("10")

      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .sendCollateral(alice.address, sendAmount),
      )
        .to.emit(activePool, "CollateralSent")
        .withArgs(alice.address, sendAmount)
    })

    it("reverts when called by unauthorized address", async () => {
      await expect(
        activePool.connect(alice).sendCollateral(bob.address, to1e18("10")),
      ).to.be.revertedWith(
        "ActivePoolERC20: Caller is neither BO nor TM nor SP",
      )
    })
  })

  describe("increaseDebt()", () => {
    it("increases principal when called by BorrowerOperations", async () => {
      const principal = to1e18("1000")
      const interest = to1e18("50")

      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(principal, interest)

      expect(await activePool.getPrincipal()).to.equal(principal)
    })

    it("increases interest when called by BorrowerOperations", async () => {
      const principal = to1e18("1000")
      const interest = to1e18("50")

      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(principal, interest)

      // Note: getInterest() also includes accrued interest from InterestRateManager
      // For this test, we check the base interest added
      const totalInterest = await activePool.getInterest()
      expect(totalInterest).to.be.gte(interest)
    })

    it("increases debt from TroveManager", async () => {
      const principal = to1e18("500")
      const interest = to1e18("25")

      await activePool
        .connect(troveManagerSigner)
        .increaseDebt(principal, interest)

      expect(await activePool.getPrincipal()).to.equal(principal)
    })

    it("emits ActivePoolDebtUpdated event", async () => {
      const principal = to1e18("1000")
      const interest = to1e18("50")

      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .increaseDebt(principal, interest),
      )
        .to.emit(activePool, "ActivePoolDebtUpdated")
        .withArgs(principal, interest)
    })

    it("reverts when called by unauthorized address", async () => {
      await expect(
        activePool.connect(alice).increaseDebt(to1e18("1000"), to1e18("50")),
      ).to.be.revertedWith("ActivePoolERC20: Caller must be BO, TM, or IRM")
    })

    it("accumulates debt over multiple calls", async () => {
      const principal1 = to1e18("1000")
      const interest1 = to1e18("50")
      const principal2 = to1e18("500")
      const interest2 = to1e18("25")

      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(principal1, interest1)
      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(principal2, interest2)

      expect(await activePool.getPrincipal()).to.equal(principal1 + principal2)
    })
  })

  describe("decreaseDebt()", () => {
    beforeEach(async () => {
      // Setup: add some debt first
      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(to1e18("1000"), to1e18("100"))
    })

    it("decreases principal when called by BorrowerOperations", async () => {
      const decreasePrincipal = to1e18("300")
      const decreaseInterest = to1e18("30")

      await activePool
        .connect(borrowerOperationsSigner)
        .decreaseDebt(decreasePrincipal, decreaseInterest)

      expect(await activePool.getPrincipal()).to.equal(to1e18("700")) // 1000 - 300
    })

    it("decreases debt from TroveManager", async () => {
      const decreasePrincipal = to1e18("200")
      const decreaseInterest = to1e18("20")

      await activePool
        .connect(troveManagerSigner)
        .decreaseDebt(decreasePrincipal, decreaseInterest)

      expect(await activePool.getPrincipal()).to.equal(to1e18("800"))
    })

    it("decreases debt from StabilityPool", async () => {
      const decreasePrincipal = to1e18("100")
      const decreaseInterest = to1e18("10")

      await activePool
        .connect(stabilityPoolSigner)
        .decreaseDebt(decreasePrincipal, decreaseInterest)

      expect(await activePool.getPrincipal()).to.equal(to1e18("900"))
    })

    it("emits ActivePoolDebtUpdated event", async () => {
      const decreasePrincipal = to1e18("300")
      const decreaseInterest = to1e18("30")

      await expect(
        activePool
          .connect(borrowerOperationsSigner)
          .decreaseDebt(decreasePrincipal, decreaseInterest),
      )
        .to.emit(activePool, "ActivePoolDebtUpdated")
        .withArgs(to1e18("700"), to1e18("70"))
    })

    it("reverts when called by unauthorized address", async () => {
      await expect(
        activePool.connect(alice).decreaseDebt(to1e18("100"), to1e18("10")),
      ).to.be.revertedWith(
        "ActivePoolERC20: Caller is neither BO nor TM nor SP",
      )
    })
  })

  describe("collateralToken()", () => {
    it("returns the collateral token address", async () => {
      expect(await activePool.collateralToken()).to.equal(
        await collateralToken.getAddress(),
      )
    })
  })

  describe("getDebt() - total debt calculation", () => {
    it("returns principal plus interest", async () => {
      const principal = to1e18("1000")
      const interest = to1e18("100")

      await activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(principal, interest)

      // getDebt() = principal + getInterest()
      // getInterest() = stored interest + accrued interest from IRM
      const debt = await activePool.getDebt()
      expect(debt).to.be.gte(principal + interest)
    })
  })
})
