import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { musd, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "GasPool",
    "setAddresses",
    await troveManager.getAddress(),
    await musd.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetGasPoolAddresses"]
func.dependencies = ["GasPool", "MUSD", "TroveManager"]
