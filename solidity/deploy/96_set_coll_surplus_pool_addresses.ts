import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { activePool, borrowerOperations, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "CollSurplusPool",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
    await activePool.getAddress(),
    ZERO_ADDRESS,
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
