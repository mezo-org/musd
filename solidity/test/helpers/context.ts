import { deployments, helpers } from "hardhat"
import { getDeployedContract } from "./contract"

import type {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  Dummy,
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
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")
  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")
  const troveManager: TroveManager = await getDeployedContract("TroveManager")
  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeedTestnet: PriceFeedTestnet =
    await getDeployedContract("PriceFeedTestnet")

  return {
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
}

export async function fixture() {
  const { deployer } = await helpers.signers.getNamedSigners()
  const [alice, bob, carol, dennis] = await helpers.signers.getUnnamedSigners()
  const {
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
  } = await deployment()

  const dummy: Dummy = await getDeployedContract("Dummy")

  return {
    activePool,
    alice,
    bob,
    borrowerOperations,
    carol,
    collSurplusPool,
    dennis,
    defaultPool,
    deployer,
    dummy,
    gasPool,
    newTroveManager,
    newBorrowerOperations,
    newStabilityPool,
    musd,
    musdTester,
    pcv,
    priceFeedTestnet,
    sortedTroves,
    stabilityPool,
    troveManager,
  }
}
