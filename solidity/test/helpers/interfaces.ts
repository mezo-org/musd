// interfaces.ts
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

import {
  ActivePool,
  ActivePool,
  BorrowerOperations,
  BorrowerOperations,
  CollSurplusPool,
  CollSurplusPoolV2,
  DefaultPool,
  DefaultPoolV2,
  GasPool,
  GasPoolV2,
  HintHelpers,
  HintHelpersV2,
  MockAggregator,
  MockAggregator,
  MockERC20,
  MockERC20,
  MUSDTester,
  PCV,
  PCVV2,
  PriceFeed,
  PriceFeedV2,
  SortedTroves,
  SortedTrovesV2,
  StabilityPool,
  StabilityPoolV2,
  TroveManagerTester,
  TroveManagerTester,
} from "../../typechain"

export interface TestingAddresses {
  activePool: string
  borrowerOperations: string
  collSurplusPool: string
  defaultPool: string
  gasPool: string
  hintHelpers: string
  mockAggregator: string
  mockERC20: string
  musd: string
  pcv: string
  priceFeed: string
  sortedTroves: string
  stabilityPool: string
  troveManager: string
  alice: string
  bob: string
  carol: string
  dennis: string
  eric: string
  frank: string
  whale: string
  deployer: string
  council: string
  treasury: string
}

type BeforeAndAfter = {
  before: bigint
  after: bigint
}

export interface ContractsState {
  troveManager: {
    baseRate: BeforeAndAfter
    collateralSnapshot: BeforeAndAfter
    lastFeeOperationTime: BeforeAndAfter
    liquidation: {
      collateral: BeforeAndAfter
      debt: BeforeAndAfter
    }
    stakes: BeforeAndAfter
    stakesSnapshot: BeforeAndAfter
    troves: BeforeAndAfter
    TCR: BeforeAndAfter
  }
  activePool: {
    btc: BeforeAndAfter
    collateral: BeforeAndAfter
    debt: BeforeAndAfter
  }
  collSurplusPool: {
    collateral: BeforeAndAfter
  }
  defaultPool: {
    btc: BeforeAndAfter
    collateral: BeforeAndAfter
    debt: BeforeAndAfter
  }
  pcv: {
    collateral: BeforeAndAfter
    debt: BeforeAndAfter
    musd: BeforeAndAfter
  }
  stabilityPool: {
    collateral: BeforeAndAfter
    musd: BeforeAndAfter
    P: BeforeAndAfter
    S: BeforeAndAfter
    currentEpoch: BeforeAndAfter
    currentScale: BeforeAndAfter
  }
}

export interface ContractsV1 {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  collSurplusPool: CollSurplusPool
  defaultPool: DefaultPool
  gasPool: GasPool
  hintHelpers: HintHelpers
  mockAggregator: MockAggregator
  mockERC20: MockERC20
  musd: MUSDTester
  pcv: PCV
  priceFeed: PriceFeed
  sortedTroves: SortedTroves
  stabilityPool: StabilityPool
  troveManager: TroveManagerTester
}

export interface ContractsV2 {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  collSurplusPool: CollSurplusPoolV2
  defaultPool: DefaultPoolV2
  gasPool: GasPoolV2
  hintHelpers: HintHelpersV2
  mockAggregator: MockAggregator
  mockERC20: MockERC20
  musd: MUSDTester
  pcv: PCVV2
  priceFeed: PriceFeedV2
  sortedTroves: SortedTrovesV2
  stabilityPool: StabilityPoolV2
  troveManager: TroveManagerTester
}

export type Contracts = ContractsV1 | ContractsV2

export interface User {
  address: string
  btc: BeforeAndAfter
  collSurplusPool: {
    collateral: BeforeAndAfter
  }
  musd: BeforeAndAfter
  trove: {
    collateral: BeforeAndAfter
    debt: BeforeAndAfter
    icr: BeforeAndAfter
    stake: BeforeAndAfter
    status: BeforeAndAfter
  }
  rewardSnapshot: {
    collateral: BeforeAndAfter
    debt: BeforeAndAfter
  }
  pending: {
    collateral: BeforeAndAfter
    debt: BeforeAndAfter
  }
  stabilityPool: {
    compoundedDeposit: BeforeAndAfter
    deposit: BeforeAndAfter
    collateralGain: BeforeAndAfter
    P: BeforeAndAfter
    S: BeforeAndAfter
  }
  wallet: HardhatEthersSigner
}

export interface Users {
  alice: User
  bob: User
  carol: User
  dennis: User
  eric: User
  frank: User
  whale: User
  deployer: User
  council: User
  treasury: User
}

export interface TestSetup {
  contracts: Contracts
  state: ContractsState
  users: Users
}

export interface TestSetupV2 {
  contracts: ContractsV2
  state: ContractsState
  users: Users
}

export interface AddCollParams {
  amount: string | bigint
  lowerHint?: string
  sender: HardhatEthersSigner
  upperHint?: string
}

export interface WithdrawCollParams {
  amount: string | bigint
  lowerHint?: string
  sender: HardhatEthersSigner
  upperHint?: string
}

export interface OpenTroveParams {
  musdAmount: string | bigint
  ICR?: string
  lowerHint?: string
  maxFeePercentage?: string
  sender: HardhatEthersSigner
  upperHint?: string
}
