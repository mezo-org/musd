import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { activePool, defaultPool, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await defaultPool
    .connect(deployer)
    .setAddresses(
      await troveManager.getAddress(),
      await activePool.getAddress(),
      ZERO_ADDRESS,
    )
}

export default func

func.tags = ["SetAddresses", "SetDefaultPoolAddresses"]
func.dependencies = ["ActivePool", "DefaultPool", "TroveManager"]
