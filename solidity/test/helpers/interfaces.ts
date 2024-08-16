// interfaces.ts
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  MockAggregator,
  MUSDTester,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManager,
  TroveManagerTester,
} from "../../typechain"

export interface TestingAddresses {
  activePool: string
  borrowerOperations: string
  collSurplusPool: string
  defaultPool: string
  gasPool: string
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
}

type BeforeAndAfter = {
  before: bigint
  after: bigint
}

export interface ContractsState {
  troveManager: {
    baseRate: BeforeAndAfter
    troves: BeforeAndAfter
    stakes: BeforeAndAfter
    liquidation: {
      collateral: BeforeAndAfter
      debt: BeforeAndAfter
    }
    TCR: BeforeAndAfter
  }
  activePool: {
    btc: BeforeAndAfter
    collateral: BeforeAndAfter
    debt: BeforeAndAfter
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
  }
}

export interface Contracts {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  collSurplusPool: CollSurplusPool
  defaultPool: DefaultPool
  gasPool: GasPool
  mockAggregator: MockAggregator
  musd: MUSDTester
  pcv: PCV
  priceFeed: PriceFeed
  sortedTroves: SortedTroves
  stabilityPool: StabilityPool
  troveManager: TroveManager | TroveManagerTester
}

export interface User {
  address: string
  btc: BeforeAndAfter
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

export interface OpenTroveParams {
  musdAmount: string | bigint
  ICR?: string
  lowerHint?: string
  maxFeePercentage?: string
  sender: HardhatEthersSigner
  upperHint?: string
}
