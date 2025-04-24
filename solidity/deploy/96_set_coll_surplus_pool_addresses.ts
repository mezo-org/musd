import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { activePool, borrowerOperations, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "CollSurplusPool",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetCollSurplusPoolAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "CollSurplusPool",
  "TroveManager",
]
