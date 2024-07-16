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
  TroveManagerTester,
} from "../../typechain"

export interface TestingAddresses {
  activePool: string
  borrowerOperations: string
  collSurplusPool: string
  defaultPool: string
  gasPool: string
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
  deployer: string
}

export interface Contracts {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  collSurplusPool: CollSurplusPool
  defaultPool: DefaultPool
  gasPool: GasPool
  musd: MUSD | MUSDTester
  pcv: PCV
  priceFeed: PriceFeedTestnet
  sortedTroves: SortedTroves
  stabilityPool: StabilityPool
  troveManager: TroveManager | TroveManagerTester
}

export interface Users {
  alice: HardhatEthersSigner
  bob: HardhatEthersSigner
  carol: HardhatEthersSigner
  dennis: HardhatEthersSigner
  eric: HardhatEthersSigner
  deployer: HardhatEthersSigner
}

export interface TestSetup {
  contracts: Contracts
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
