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
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManager,
} from "../../typechain/contracts/v1"
import type { MUSD } from "../../typechain/contracts/token"

import type {
  MockAggregator,
  MUSDTester,
  TroveManagerTester,
} from "../../typechain/contracts/v1/tests"

const maxBytes32 = `0x${"f".repeat(64)}`

// eslint-disable-next-line import/prefer-default-export
export async function deployment(overwrite: Array<string>) {
  await deployments.fixture()

  const activePool: ActivePool = await getDeployedContract("ActivePool")
  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")
  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")
  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")
  const mockAggregator: MockAggregator =
    await getDeployedContract("MockAggregator")
  const musd: MUSD | MUSDTester = overwrite.includes("MUSD")
    ? await getDeployedContract("MUSDTester")
    : await getDeployedContract("MUSD")
  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")
  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")
  const troveManager: TroveManager | TroveManagerTester = overwrite.includes(
    "TroveManager",
  )
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

  const contracts: Contracts = {
    activePool,
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    gasPool,
    mockAggregator,
    musd,
    pcv,
    priceFeed,
    sortedTroves,
    stabilityPool,
    troveManager,
  }

  return contracts
}

function initializeContractState(): ContractsState {
  return {
    troveManager: {
      baseRate: {
        before: 0n,
        after: 0n,
      },
      troves: {
        before: 0n,
        after: 0n,
      },
      stakes: {
        before: 0n,
        after: 0n,
      },
      liquidation: {
        collateral: {
          before: 0n,
          after: 0n,
        },
        debt: {
          before: 0n,
          after: 0n,
        },
      },
    },
    activePool: {
      btc: {
        before: 0n,
        after: 0n,
      },
      collateral: {
        before: 0n,
        after: 0n,
      },
      debt: {
        before: 0n,
        after: 0n,
      },
    },
    pcv: {
      collateral: {
        before: 0n,
        after: 0n,
      },
      debt: {
        before: 0n,
        after: 0n,
      },
      musd: {
        before: 0n,
        after: 0n,
      },
    },
  }
}

async function initializeUserObject(
  wallet: HardhatEthersSigner,
): Promise<User> {
  const user: User = {
    address: await wallet.getAddress(),
    btc: {
      before: 0n,
      after: 0n,
    },
    musd: {
      before: 0n,
      after: 0n,
    },
    trove: {
      collateral: {
        before: 0n,
        after: 0n,
      },
      debt: {
        before: 0n,
        after: 0n,
      },
      icr: {
        before: 0n,
        after: 0n,
      },
      stake: {
        before: 0n,
        after: 0n,
      },
      status: {
        before: 0n,
        after: 0n,
      },
    },
    rewardSnapshot: {
      collateral: {
        before: 0n,
        after: 0n,
      },
      debt: {
        before: 0n,
        after: 0n,
      },
    },
    pending: {
      collateral: {
        before: 0n,
        after: 0n,
      },
      debt: {
        before: 0n,
        after: 0n,
      },
    },
    wallet,
  }
  return user
}

/*
 * For explanation on why each testcontract has its own fixture function
 * https://hardhat.org/hardhat-network-helpers/docs/reference#fixtures
 */

export async function fixture(): Promise<TestSetup> {
  const { deployer } = await helpers.signers.getNamedSigners()
  const [aliceWallet, bobWallet, carolWallet, dennisWallet, ericWallet] =
    await helpers.signers.getUnnamedSigners()
  const contracts = await deployment(["MUSD", "PriceFeed", "TroveManager"])

  const users: Users = {
    alice: await initializeUserObject(aliceWallet),
    bob: await initializeUserObject(bobWallet),
    carol: await initializeUserObject(carolWallet),
    dennis: await initializeUserObject(dennisWallet),
    eric: await initializeUserObject(ericWallet),
    deployer: await initializeUserObject(deployer),
  }

  const state: ContractsState = initializeContractState()

  const testSetup: TestSetup = {
    users,
    state,
    contracts,
  }

  return testSetup
}

export async function getAddresses(contracts: Contracts, users: Users) {
  const addresses: TestingAddresses = {
    // contracts
    activePool: await contracts.activePool.getAddress(),
    borrowerOperations: await contracts.borrowerOperations.getAddress(),
    collSurplusPool: await contracts.collSurplusPool.getAddress(),
    defaultPool: await contracts.defaultPool.getAddress(),
    gasPool: await contracts.gasPool.getAddress(),
    mockAggregator: await contracts.mockAggregator.getAddress(),
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
    deployer: users.deployer.wallet.address,
  }

  return addresses
}

export async function connectContracts(contracts: Contracts, users: Users) {
  //  connect contracts

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
