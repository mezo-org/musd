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

  const { activePool, troveManager } = await newFetchAllDeployedContracts(
    isHardhatNetwork,
    isFuzzTestingNetwork,
  )

  await execute(
    "NewDefaultPool",
    "setAddresses",
    await activePool.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetDefaultPoolAddresses"]
func.dependencies = ["NewActivePool", "NewDefaultPool", "NewTroveManager"]
