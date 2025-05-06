// interfaces.ts
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

import {
  ActivePool,
  BorrowerOperations,
  BorrowerOperationsSignatures,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  GovernableVariables,
  HintHelpers,
  InterestRateManager,
  MockAggregator,
  MUSDTester,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManagerTester,
} from "../../typechain"

export interface TestingAddresses {
  activePool: string
  borrowerOperations: string
  borrowerOperationsSignatures: string
  collSurplusPool: string
  defaultPool: string
  gasPool: string
  hintHelpers: string
  interestRateManager: string
  mockAggregator: string
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
    collateralSnapshot: BeforeAndAfter
    liquidation: {
      collateral: BeforeAndAfter
      principal: BeforeAndAfter
      interest: BeforeAndAfter
    }
    stakes: BeforeAndAfter
    stakesSnapshot: BeforeAndAfter
    troves: BeforeAndAfter
    TCR: BeforeAndAfter
  }
  activePool: {
    btc: BeforeAndAfter
    collateral: BeforeAndAfter
    principal: BeforeAndAfter
    interest: BeforeAndAfter
    debt: BeforeAndAfter
  }
  collSurplusPool: {
    collateral: BeforeAndAfter
  }
  defaultPool: {
    btc: BeforeAndAfter
    collateral: BeforeAndAfter
    principal: BeforeAndAfter
    interest: BeforeAndAfter
    debt: BeforeAndAfter
  }
  pcv: {
    collateral: BeforeAndAfter
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

export interface Contracts {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  borrowerOperationsSignatures: BorrowerOperationsSignatures
  collSurplusPool: CollSurplusPool
  defaultPool: DefaultPool
  gasPool: GasPool
  governableVariables: GovernableVariables
  hintHelpers: HintHelpers
  interestRateManager: InterestRateManager
  mockAggregator: MockAggregator
  musd: MUSDTester
  pcv: PCV
  priceFeed: PriceFeed
  sortedTroves: SortedTroves
  stabilityPool: StabilityPool
  troveManager: TroveManagerTester
}

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
    interestOwed: BeforeAndAfter
    stake: BeforeAndAfter
    status: BeforeAndAfter
    interestRate: BeforeAndAfter
    lastInterestUpdateTime: BeforeAndAfter
    maxBorrowingCapacity: BeforeAndAfter
    arrayIndex: BeforeAndAfter
    icr: BeforeAndAfter
  }
  rewardSnapshot: {
    collateral: BeforeAndAfter
    principal: BeforeAndAfter
    interest: BeforeAndAfter
  }
  pending: {
    collateral: BeforeAndAfter
    principal: BeforeAndAfter
    interest: BeforeAndAfter
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
  sender: HardhatEthersSigner
  upperHint?: string
}
