import { deployments, helpers } from "hardhat"
import { assert } from "chai"
import { getDeployedContract } from "./contract"
import { to1e18, ZERO_ADDRESS } from "../utils"
import { Contracts, Users, TestSetup, TestingAddresses } from "./interfaces"
import type {
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
  const musd: MUSD | MUSDTester = overwrite.includes("MUSD")
    ? await getDeployedContract("MUSDTester")
    : await getDeployedContract("MUSD")
  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeed: PriceFeedTestnet =
    await getDeployedContract("PriceFeedTestnet")
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
    musd,
    pcv,
    priceFeed,
    sortedTroves,
    stabilityPool,
    troveManager,
  }

  return contracts
}

/*
 * For explanation on why each testcontract has its own fixture function
 * https://hardhat.org/hardhat-network-helpers/docs/reference#fixtures
 */

export async function fixtureMUSD(): Promise<TestSetup> {
  const { deployer } = await helpers.signers.getNamedSigners()
  const [aliceWallet, bobWallet, carolWallet, dennisWallet, ericWallet] =
    await helpers.signers.getUnnamedSigners()
  const contracts = await deployment(["MUSD"])

  const users: Users = {
    alice: {
      address: aliceWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: aliceWallet,
    },
    bob: {
      address: bobWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: bobWallet,
    },
    carol: {
      address: carolWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: carolWallet,
    },
    dennis: {
      address: dennisWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: dennisWallet,
    },
    eric: {
      address: ericWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: ericWallet,
    },
    deployer: {
      address: deployer.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: deployer,
    },
  }

  const testSetup: TestSetup = {
    users,
    contracts,
  }

  // Mint using tester functions.
  if ("unprotectedMint" in contracts.musd) {
    await contracts.musd.unprotectedMint(users.alice.wallet, to1e18(150))
    await contracts.musd.unprotectedMint(users.bob.wallet, to1e18(100))
    await contracts.musd.unprotectedMint(users.carol.wallet, to1e18(50))
  } else {
    assert.fail("MUSDTester not loaded in context.ts")
  }

  return testSetup
}

export async function fixtureBorrowerOperations(): Promise<TestSetup> {
  const { deployer } = await helpers.signers.getNamedSigners()
  const [aliceWallet, bobWallet, carolWallet, dennisWallet, ericWallet] =
    await helpers.signers.getUnnamedSigners()
  const contracts = await deployment(["TroveManager"])

  const users: Users = {
    alice: {
      address: aliceWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: aliceWallet,
    },
    bob: {
      address: bobWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: bobWallet,
    },
    carol: {
      address: carolWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: carolWallet,
    },
    dennis: {
      address: dennisWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: dennisWallet,
    },
    eric: {
      address: ericWallet.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: ericWallet,
    },
    deployer: {
      address: deployer.address,
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
      musd: {
        before: 0n,
        after: 0n,
      },
      wallet: deployer,
    },
  }

  const testSetup: TestSetup = {
    users,
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
}
