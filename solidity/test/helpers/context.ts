import { deployments, helpers } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { getDeployedContract } from "./contract"
import { ZERO_ADDRESS } from "../utils"
import {
  Contracts,
  ContractsState,
  TestingAddresses,
  TestSetup,
  User,
  Users,
} from "./interfaces"
import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  HintHelpers,
  MockAggregator,
  MockERC20,
  MUSDTester,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManagerTester,
} from "../../typechain"

const maxBytes32 = `0x${"f".repeat(64)}`

export async function deployment() {
  await deployments.fixture()

  const activePool: ActivePool = await getDeployedContract("ActivePool")
  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")
  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")
  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")
  const hintHelpers: HintHelpers = await getDeployedContract("HintHelpers")
  const mockAggregator: MockAggregator =
    await getDeployedContract("MockAggregator")
  const mockERC20: MockERC20 = await getDeployedContract("MockERC20")
  const musd: MUSDTester = await getDeployedContract("MUSDTester")
  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")
  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")
  const troveManager: TroveManagerTester =
    await getDeployedContract("TroveManagerTester")

  const contracts: Contracts = {
    activePool,
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    gasPool,
    hintHelpers,
    mockAggregator,
    mockERC20,
    musd,
    pcv,
    priceFeed,
    sortedTroves,
    stabilityPool,
    troveManager,
  }

  return contracts
}

export const beforeAndAfter = () => ({ before: 0n, after: 0n })

function initializeContractState(): ContractsState {
  return {
    troveManager: {
      baseRate: beforeAndAfter(),
      collateralSnapshot: beforeAndAfter(),
      interestRateData: {},
      lastFeeOperationTime: beforeAndAfter(),
      liquidation: {
        collateral: beforeAndAfter(),
        principal: beforeAndAfter(),
        interest: beforeAndAfter(),
      },
      stakes: beforeAndAfter(),
      stakesSnapshot: beforeAndAfter(),
      troves: beforeAndAfter(),
      TCR: beforeAndAfter(),
    },
    activePool: {
      btc: beforeAndAfter(),
      collateral: beforeAndAfter(),
      principal: beforeAndAfter(),
      interest: beforeAndAfter(),
      debt: beforeAndAfter(),
    },
    defaultPool: {
      btc: beforeAndAfter(),
      collateral: beforeAndAfter(),
      principal: beforeAndAfter(),
      interest: beforeAndAfter(),
      debt: beforeAndAfter(),
    },
    collSurplusPool: {
      collateral: beforeAndAfter(),
    },
    pcv: {
      collateral: beforeAndAfter(),
      debt: beforeAndAfter(),
      musd: beforeAndAfter(),
    },
    stabilityPool: {
      collateral: beforeAndAfter(),
      musd: beforeAndAfter(),
      P: beforeAndAfter(),
      S: beforeAndAfter(),
      currentEpoch: beforeAndAfter(),
      currentScale: beforeAndAfter(),
    },
  }
}

async function initializeUserObject(
  wallet: HardhatEthersSigner,
): Promise<User> {
  const user: User = {
    address: await wallet.getAddress(),
    btc: beforeAndAfter(),
    collSurplusPool: {
      collateral: beforeAndAfter(),
    },
    musd: beforeAndAfter(),
    rewardSnapshot: {
      collateral: beforeAndAfter(),
      principal: beforeAndAfter(),
      interest: beforeAndAfter(),
    },
    pending: {
      collateral: beforeAndAfter(),
      principal: beforeAndAfter(),
      interest: beforeAndAfter(),
    },
    stabilityPool: {
      compoundedDeposit: beforeAndAfter(),
      deposit: beforeAndAfter(),
      collateralGain: beforeAndAfter(),
      P: beforeAndAfter(),
      S: beforeAndAfter(),
    },
    trove: {
      collateral: beforeAndAfter(),
      debt: beforeAndAfter(),
      interestOwed: beforeAndAfter(),
      stake: beforeAndAfter(),
      status: beforeAndAfter(),
      interestRate: beforeAndAfter(),
      lastInterestUpdateTime: beforeAndAfter(),
      maxBorrowingCapacity: beforeAndAfter(),
      arrayIndex: beforeAndAfter(),
      icr: beforeAndAfter(),
    },
    wallet,
  }
  return user
}

export async function loadTestSetup(): Promise<TestSetup> {
  const contracts = await loadFixture(deployment)

  const { deployer } = await helpers.signers.getNamedSigners()
  const [
    aliceWallet,
    bobWallet,
    carolWallet,
    dennisWallet,
    ericWallet,
    frankWallet,
    whaleWallet,
    councilWallet,
    treasuryWallet,
  ] = await helpers.signers.getUnnamedSigners()

  const users: Users = {
    alice: await initializeUserObject(aliceWallet),
    bob: await initializeUserObject(bobWallet),
    carol: await initializeUserObject(carolWallet),
    dennis: await initializeUserObject(dennisWallet),
    eric: await initializeUserObject(ericWallet),
    frank: await initializeUserObject(frankWallet),
    whale: await initializeUserObject(whaleWallet),
    deployer: await initializeUserObject(deployer),
    council: await initializeUserObject(councilWallet),
    treasury: await initializeUserObject(treasuryWallet),
  }

  const state: ContractsState = initializeContractState()

  return {
    users,
    state,
    contracts,
  }
}

export async function getAddresses(contracts: Contracts, users: Users) {
  const addresses: TestingAddresses = {
    // contracts
    activePool: await contracts.activePool.getAddress(),
    borrowerOperations: await contracts.borrowerOperations.getAddress(),
    collSurplusPool: await contracts.collSurplusPool.getAddress(),
    defaultPool: await contracts.defaultPool.getAddress(),
    gasPool: await contracts.gasPool.getAddress(),
    hintHelpers: await contracts.hintHelpers.getAddress(),
    mockAggregator: await contracts.mockAggregator.getAddress(),
    mockERC20: await contracts.mockERC20.getAddress(),
    musd: await contracts.musd.getAddress(),
    pcv: await contracts.pcv.getAddress(),
    priceFeed: await contracts.priceFeed.getAddress(),
    sortedTroves: await contracts.sortedTroves.getAddress(),
    stabilityPool: await contracts.stabilityPool.getAddress(),
    troveManager: await contracts.troveManager.getAddress(),
    // users
    alice: users.alice.wallet.address,
    bob: users.bob.wallet.address,
    carol: users.carol.wallet.address,
    dennis: users.dennis.wallet.address,
    eric: users.eric.wallet.address,
    frank: users.frank.wallet.address,
    whale: users.whale.wallet.address,
    deployer: users.deployer.wallet.address,
    council: users.council.wallet.address,
    treasury: users.treasury.wallet.address,
  }

  return addresses
}

export async function connectContracts(contracts: Contracts, users: Users) {
  //  connect contracts

  await contracts.stabilityPool
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.borrowerOperations.getAddress(),
      await contracts.troveManager.getAddress(),
      await contracts.activePool.getAddress(),
      await contracts.musd.getAddress(),
      await contracts.sortedTroves.getAddress(),
      await contracts.priceFeed.getAddress(),
      ZERO_ADDRESS,
    )

  await contracts.hintHelpers
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.sortedTroves.getAddress(),
      await contracts.troveManager.getAddress(),
    )

  await contracts.pcv
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.musd.getAddress(),
      await contracts.borrowerOperations.getAddress(),
      ZERO_ADDRESS,
    )

  await contracts.defaultPool
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.troveManager.getAddress(),
      await contracts.activePool.getAddress(),
      ZERO_ADDRESS,
    )

  await contracts.activePool
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.borrowerOperations.getAddress(),
      ZERO_ADDRESS,
      await contracts.collSurplusPool.getAddress(),
      await contracts.defaultPool.getAddress(),
      await contracts.troveManager.getAddress(),
      await contracts.stabilityPool.getAddress(),
    )

  await contracts.borrowerOperations
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.activePool.getAddress(),
      ZERO_ADDRESS,
      await contracts.collSurplusPool.getAddress(),
      await contracts.defaultPool.getAddress(),
      await contracts.gasPool.getAddress(),
      await contracts.musd.getAddress(),
      await contracts.pcv.getAddress(),
      await contracts.priceFeed.getAddress(),
      await contracts.stabilityPool.getAddress(),
      await contracts.sortedTroves.getAddress(),
      await contracts.troveManager.getAddress(),
    )

  await contracts.collSurplusPool
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.borrowerOperations.getAddress(),
      await contracts.troveManager.getAddress(),
      await contracts.activePool.getAddress(),
      ZERO_ADDRESS,
    )

  await contracts.troveManager
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.activePool.getAddress(),
      await contracts.borrowerOperations.getAddress(),
      await contracts.collSurplusPool.getAddress(),
      await contracts.defaultPool.getAddress(),
      await contracts.gasPool.getAddress(),
      await contracts.musd.getAddress(),
      await contracts.pcv.getAddress(),
      await contracts.priceFeed.getAddress(),
      await contracts.sortedTroves.getAddress(),
      await contracts.stabilityPool.getAddress(),
    )

  await contracts.gasPool
    .connect(users.deployer.wallet)
    .setAddresses(
      await contracts.troveManager.getAddress(),
      await contracts.musd.getAddress(),
    )

  await contracts.sortedTroves
    .connect(users.deployer.wallet)
    .setParams(
      maxBytes32,
      await contracts.troveManager.getAddress(),
      await contracts.borrowerOperations.getAddress(),
    )

  await contracts.priceFeed
    .connect(users.deployer.wallet)
    .setOracle(await contracts.mockAggregator.getAddress())
}
