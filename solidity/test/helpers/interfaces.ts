// interfaces.ts
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  MUSD,
  MUSDTester,
  PCV,
  PriceFeedTestnet,
  SortedTroves,
  StabilityPool,
  TroveManager,
} from "../../typechain"

export interface TestingAddresses {
  activePool: string
  borrowerOperations: string
  collSurplusPool: string
  defaultPool: string
  gasPool: string
  musd: string
  musdTester: string
  newBorrowerOperations: string
  newStabilityPool: string
  newTroveManager: string
  pcv: string
  priceFeedTestnet: string
  sortedTroves: string
  stabilityPool: string
  troveManager: string
  alice: string
  bob: string
  carol: string
  dennis: string
  deployer: string
}

export interface Contracts {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  collSurplusPool: CollSurplusPool
  defaultPool: DefaultPool
  gasPool: GasPool
  musd: MUSD
  musdTester: MUSDTester
  newBorrowerOperations: BorrowerOperations
  newStabilityPool: StabilityPool
  newTroveManager: TroveManager
  pcv: PCV
  priceFeedTestnet: PriceFeedTestnet
  sortedTroves: SortedTroves
  stabilityPool: StabilityPool
  troveManager: TroveManager
}

export interface Users {
  alice: HardhatEthersSigner
  bob: HardhatEthersSigner
  carol: HardhatEthersSigner
  dennis: HardhatEthersSigner
  deployer: HardhatEthersSigner
}

export interface TestSetup {
  contracts: Contracts
  users: Users
}

export interface OpenTroveParams {
  musdAmount: string | bigint
  ICR?: string
  lowerHint?: string
  maxFeePercentage?: string
  sender: HardhatEthersSigner
  upperHint?: string
}
