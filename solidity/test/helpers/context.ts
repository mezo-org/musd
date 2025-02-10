import { deployments, helpers } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { getDeployedContract } from "./contract"
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
  BorrowerOperationsSignatures,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  HintHelpers,
  InterestRateManager,
  MockAggregator,
  MockERC20,
  MUSDTester,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManagerTester,
} from "../../typechain"

export async function deployment() {
  await deployments.fixture()

  const activePool: ActivePool = await getDeployedContract("ActivePool")
  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")
  const borrowerOperationsSignatures: BorrowerOperationsSignatures =
    await getDeployedContract("BorrowerOperationsSignatures")
  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")
  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")
  const hintHelpers: HintHelpers = await getDeployedContract("HintHelpers")
  const interestRateManager: InterestRateManager = await getDeployedContract(
    "InterestRateManager",
  )
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
    borrowerOperationsSignatures,
    collSurplusPool,
    defaultPool,
    gasPool,
    hintHelpers,
    interestRateManager,
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
    interestRateManager: {
      interestRateData: {},
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
    borrowerOperationsSignatures:
      await contracts.borrowerOperationsSignatures.getAddress(),
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
