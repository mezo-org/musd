import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
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

  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")

  const troveManager: TroveManager | TroveManagerTester = isHardhatNetwork
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

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
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "CollSurplusPool",
  "DefaultPool",
  "StabilityPool",
  "TroveManager",
]
