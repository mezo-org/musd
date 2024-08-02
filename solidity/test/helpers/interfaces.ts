// interfaces.ts
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  MockAggregator,
  MUSD,
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
  deployer: string
}

export interface ContractsState {
  troveManager: {
    baseRate: {
      before: bigint
      after: bigint
    }
    troves: {
      before: bigint
      after: bigint
    }
    stakes: {
      before: bigint
      after: bigint
    }
    liquidation: {
      collateral: {
        before: bigint
        after: bigint
      }
      debt: {
        before: bigint
        after: bigint
      }
    }
  }
  activePool: {
    btc: {
      before: bigint
      after: bigint
    }
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
  }
  pcv: {
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
    musd: {
      before: bigint
      after: bigint
    }
  }
  stabilityPool: {
    deposits: {
      before: bigint
      after: bigint
    }
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
    musd: {
      before: bigint
      after: bigint
    }
  }
}

export interface Contracts {
  activePool: ActivePool
  borrowerOperations: BorrowerOperations
  collSurplusPool: CollSurplusPool
  defaultPool: DefaultPool
  gasPool: GasPool
  mockAggregator: MockAggregator
  musd: MUSD | MUSDTester
  pcv: PCV
  priceFeed: PriceFeed
  sortedTroves: SortedTroves
  stabilityPool: StabilityPool
  troveManager: TroveManager | TroveManagerTester
}

export interface User {
  address: string
  btc: {
    before: bigint
    after: bigint
  }
  musd: {
    before: bigint
    after: bigint
  }
  trove: {
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
    icr: {
      before: bigint
      after: bigint
    }
    stake: {
      before: bigint
      after: bigint
    }
    status: {
      before: bigint
      after: bigint
    }
  }
  rewardSnapshot: {
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
  }
  pending: {
    collateral: {
      before: bigint
      after: bigint
    }
    debt: {
      before: bigint
      after: bigint
    }
  }
  wallet: HardhatEthersSigner
}

export interface Users {
  alice: User
  bob: User
  carol: User
  dennis: User
  eric: User
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
