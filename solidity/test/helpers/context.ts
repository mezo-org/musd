import { deployments, helpers } from "hardhat"
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
  PCV,
  SortedTroves,
  StabilityPool,
  TroveManager,
} from "../../typechain/contracts"

import type {
  MUSDTester,
  PriceFeedTestnet,
} from "../../typechain/contracts/tests"

// eslint-disable-next-line import/prefer-default-export
export async function deployment() {
  await deployments.fixture()

  const activePool: ActivePool = await getDeployedContract("ActivePool")
  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")
  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")
  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")
  const musd: MUSD = await getDeployedContract("MUSD")
  const musdTester: MUSDTester = await getDeployedContract("MUSDTester")
  const newBorrowerOperations: BorrowerOperations =
    await getDeployedContract("Dummy")
  const newStabilityPool: StabilityPool = await getDeployedContract("Dummy")
  const newTroveManager: TroveManager = await getDeployedContract("Dummy")
  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeedTestnet: PriceFeedTestnet =
    await getDeployedContract("PriceFeedTestnet")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")
  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")
  const troveManager: TroveManager = await getDeployedContract("TroveManager")

  const contracts: Contracts = {
    activePool,
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    gasPool,
    musd,
    musdTester,
    newBorrowerOperations,
    newStabilityPool,
    newTroveManager,
    pcv,
    priceFeedTestnet,
    sortedTroves,
    stabilityPool,
    troveManager,
  }

  return contracts
}

export async function fixture() {
  const { deployer } = await helpers.signers.getNamedSigners()
  const [alice, bob, carol, dennis] = await helpers.signers.getUnnamedSigners()
  const contracts = await deployment()

  const users: Users = {
    alice,
    bob,
    carol,
    dennis,
    deployer,
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
    musdTester: await contracts.musdTester.getAddress(),
    newBorrowerOperations: await contracts.newBorrowerOperations.getAddress(),
    newStabilityPool: await contracts.newStabilityPool.getAddress(),
    newTroveManager: await contracts.newTroveManager.getAddress(),
    pcv: await contracts.pcv.getAddress(),
    priceFeedTestnet: await contracts.priceFeedTestnet.getAddress(),
    sortedTroves: await contracts.sortedTroves.getAddress(),
    stabilityPool: await contracts.stabilityPool.getAddress(),
    troveManager: await contracts.troveManager.getAddress(),
    // users
    alice: users.alice.address,
    bob: users.bob.address,
    carol: users.carol.address,
    dennis: users.dennis.address,
    deployer: users.deployer.address,
  }

  return addresses
}

export async function connectContracts(contracts: Contracts, users: Users) {
  //  connect contracts
  await contracts.pcv
    .connect(users.deployer)
    .setAddresses(
      await contracts.musd.getAddress(),
      await contracts.borrowerOperations.getAddress(),
      ZERO_ADDRESS,
    )

  await contracts.activePool
    .connect(users.deployer)
    .setAddresses(
      await contracts.borrowerOperations.getAddress(),
      ZERO_ADDRESS,
      await contracts.collSurplusPool.getAddress(),
      await contracts.defaultPool.getAddress(),
      await contracts.troveManager.getAddress(),
      await contracts.stabilityPool.getAddress(),
    )

  await contracts.borrowerOperations
    .connect(users.deployer)
    .setAddresses(
      await contracts.activePool.getAddress(),
      ZERO_ADDRESS,
      await contracts.collSurplusPool.getAddress(),
      await contracts.defaultPool.getAddress(),
      await contracts.gasPool.getAddress(),
      await contracts.musd.getAddress(),
      await contracts.pcv.getAddress(),
      await contracts.priceFeedTestnet.getAddress(),
      await contracts.stabilityPool.getAddress(),
      await contracts.sortedTroves.getAddress(),
      await contracts.troveManager.getAddress(),
    )

  await contracts.troveManager
    .connect(users.deployer)
    .setAddresses(
      await contracts.activePool.getAddress(),
      await contracts.borrowerOperations.getAddress(),
      await contracts.collSurplusPool.getAddress(),
      await contracts.defaultPool.getAddress(),
      await contracts.gasPool.getAddress(),
      await contracts.musd.getAddress(),
      await contracts.pcv.getAddress(),
      await contracts.priceFeedTestnet.getAddress(),
      await contracts.sortedTroves.getAddress(),
      await contracts.stabilityPool.getAddress(),
    )
  await contracts.musdTester.unprotectedMint(users.alice, to1e18(150))
  await contracts.musdTester.unprotectedMint(users.bob, to1e18(100))
  await contracts.musdTester.unprotectedMint(users.carol, to1e18(50))
}
