import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManager,
  TroveManagerTester,
} from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const activePool: ActivePool = await getDeployedContract("ActivePool")

  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")

  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")

  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")

  const musd = isHardhatNetwork
    ? await getDeployedContract("MUSDTester")
    : await getDeployedContract("MUSD")

  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")

  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")

  const troveManager: TroveManager | TroveManagerTester = isHardhatNetwork
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

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
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "CollSurplusPool",
  "DefaultPool",
  "GasPool",
  "MUSD",
  "PCV",
  "PriceFeed",
  "SortedTroves",
  "StabilityPool",
  "TroveManager",
]
