import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { activePool, borrowerOperations, troveManager } =
    await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "NewCollSurplusPool",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetCollSurplusPoolAddresses"]
func.dependencies = [
  "NewActivePool",
  "NewBorrowerOperations",
  "NewCollSurplusPool",
  "NewTroveManager",
]
