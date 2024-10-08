import { deployments, helpers } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { getDeployedContract } from "./contract"
import { ZERO_ADDRESS } from "../utils"
import {
  Contracts,
  Users,
  TestSetup,
  TestingAddresses,
  User,
  ContractsState,
} from "./interfaces"
import type {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  HintHelpers,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
} from "../../typechain/contracts/v1"

import type {
  MockAggregator,
  MockERC20,
  MUSDTester,
  TroveManagerTester,
} from "../../typechain/contracts/v1/tests"
import { TroveManagerTesterV2 } from "../../typechain"

const maxBytes32 = `0x${"f".repeat(64)}`

// eslint-disable-next-line import/prefer-default-export
export async function deployment(version: "v1" | "v2" = "v1") {
  await deployments.fixture()

  const suffix = version === "v2" ? "V2" : ""

  const activePool: ActivePool = await getDeployedContract(
    `ActivePool${suffix}`,
  )
  const borrowerOperations: BorrowerOperations = await getDeployedContract(
    `BorrowerOperations${suffix}`,
  )
  const collSurplusPool: CollSurplusPool = await getDeployedContract(
    `CollSurplusPool${suffix}`,
  )
  const defaultPool: DefaultPool = await getDeployedContract(
    `DefaultPool${suffix}`,
  )
  const gasPool: GasPool = await getDeployedContract(`GasPool${suffix}`)
  const hintHelpers: HintHelpers = await getDeployedContract(
    `HintHelpers${suffix}`,
  )
  const mockAggregator: MockAggregator = await getDeployedContract(
    `MockAggregator${suffix}`,
  )
  const mockERC20: MockERC20 = await getDeployedContract(`MockERC20${suffix}`)
  const musd: MUSDTester = await getDeployedContract(`MUSDTester${suffix}`)
  const pcv: PCV = await getDeployedContract(`PCV${suffix}`)
  const priceFeed: PriceFeed = await getDeployedContract(`PriceFeed${suffix}`)
  const sortedTroves: SortedTroves = await getDeployedContract(
    `SortedTroves${suffix}`,
  )
  const stabilityPool: StabilityPool = await getDeployedContract(
    `StabilityPool${suffix}`,
  )
  const troveManager: TroveManagerTester & TroveManagerTesterV2 =
    await getDeployedContract(`TroveManagerTester${suffix}`)

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

const beforeAndAfter = () => ({ before: 0n, after: 0n })

function initializeContractState(): ContractsState {
  return {
    troveManager: {
      baseRate: beforeAndAfter(),
      collateralSnapshot: beforeAndAfter(),
      lastFeeOperationTime: beforeAndAfter(),
      liquidation: {
        collateral: beforeAndAfter(),
        debt: beforeAndAfter(),
      },
      stakes: beforeAndAfter(),
      stakesSnapshot: beforeAndAfter(),
      troves: beforeAndAfter(),
      TCR: beforeAndAfter(),
    },
    activePool: {
      btc: beforeAndAfter(),
      collateral: beforeAndAfter(),
      debt: beforeAndAfter(),
    },
    defaultPool: {
      btc: beforeAndAfter(),
      collateral: beforeAndAfter(),
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
    musd: beforeAndAfter(),
    rewardSnapshot: {
      collateral: beforeAndAfter(),
      debt: beforeAndAfter(),
    },
    pending: {
      collateral: beforeAndAfter(),
      debt: beforeAndAfter(),
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
      icr: beforeAndAfter(),
      stake: beforeAndAfter(),
      status: beforeAndAfter(),
    },
    wallet,
  }
  return user
}

/*
 * For explanation on why each testcontract has its own fixture function
 * https://hardhat.org/hardhat-network-helpers/docs/reference#fixtures
 */

export async function fixture(version: "v1" | "v2" = "v1"): Promise<TestSetup> {
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
  const contracts = await deployment(version)

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

  const testSetup: TestSetup = {
    users,
    state,
    contracts,
  }

  return testSetup
}

// Needed because loadFixture cannot take an anonymous function as a parameter
export async function fixtureV2() {
  return fixture("v2")
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
