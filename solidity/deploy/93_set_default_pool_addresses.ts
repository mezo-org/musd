import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { activePool, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "DefaultPool",
    "setAddresses",
    await activePool.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetDefaultPoolAddresses"]
func.dependencies = ["ActivePool", "DefaultPool", "TroveManager"]
