import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { getDeployedContract } from "../helpers/deploy-helpers"

import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  HintHelpers,
  MockAggregator,
  MUSDTester,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManagerTester,
} from "../typechain"

const maxBytes32 = `0x${"f".repeat(64)}`
export const ZERO_ADDRESS = `0x${"0".repeat(40)}`

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const activePool: ActivePool = await getDeployedContract("ActivePool")
  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")
  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")
  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")
  const hintHelpers: HintHelpers = await getDeployedContract("HintHelpers")
  const mockAggregator: MockAggregator =
    await getDeployedContract("MockAggregator")
  const musd: MUSDTester = await getDeployedContract("MUSDTester")
  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")
  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")
  const troveManager: TroveManagerTester =
    await getDeployedContract("TroveManagerTester")

  await stabilityPool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
      await activePool.getAddress(),
      await musd.getAddress(),
      await sortedTroves.getAddress(),
      await priceFeed.getAddress(),
      ZERO_ADDRESS,
    )

  await hintHelpers
    .connect(deployer)
    .setAddresses(
      await sortedTroves.getAddress(),
      await troveManager.getAddress(),
    )

  await pcv
    .connect(deployer)
    .setAddresses(
      await musd.getAddress(),
      await borrowerOperations.getAddress(),
      ZERO_ADDRESS,
    )

  await defaultPool
    .connect(deployer)
    .setAddresses(
      await troveManager.getAddress(),
      await activePool.getAddress(),
      ZERO_ADDRESS,
    )

  await activePool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      ZERO_ADDRESS,
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await troveManager.getAddress(),
      await stabilityPool.getAddress(),
    )

  await borrowerOperations
    .connect(deployer)
    .setAddresses(
      await activePool.getAddress(),
      ZERO_ADDRESS,
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await gasPool.getAddress(),
      await musd.getAddress(),
      await pcv.getAddress(),
      await priceFeed.getAddress(),
      await stabilityPool.getAddress(),
      await sortedTroves.getAddress(),
      await troveManager.getAddress(),
    )

  await collSurplusPool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
      await activePool.getAddress(),
      ZERO_ADDRESS,
    )

  await troveManager
    .connect(deployer)
    .setAddresses(
      await activePool.getAddress(),
      await borrowerOperations.getAddress(),
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await gasPool.getAddress(),
      await musd.getAddress(),
      await pcv.getAddress(),
      await priceFeed.getAddress(),
      await sortedTroves.getAddress(),
      await stabilityPool.getAddress(),
    )

  await gasPool
    .connect(deployer)
    .setAddresses(await troveManager.getAddress(), await musd.getAddress())

  await sortedTroves
    .connect(deployer)
    .setParams(
      maxBytes32,
      await troveManager.getAddress(),
      await borrowerOperations.getAddress(),
    )

  await priceFeed.connect(deployer).setOracle(await mockAggregator.getAddress())
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = ["BorrowerOperations", "TroveManager", "StabilityPool"]
