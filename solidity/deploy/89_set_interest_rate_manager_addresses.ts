import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { activePool, musd, pcv, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "InterestRateManager",
    "setAddresses",
    await activePool.getAddress(),
    await musd.getAddress(),
    await pcv.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetInterestRateManagerAddresses"]
func.dependencies = [
  "ActivePool",
  "MUSD",
  "InterestRateManager",
  "PCV",
  "TroveManager",
]
