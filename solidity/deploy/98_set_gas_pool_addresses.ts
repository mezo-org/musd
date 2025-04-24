import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { musd, troveManager } = await fetchAllDeployedContracts(
    isHardhatNetwork,
    isFuzzTestingNetwork,
  )

  await execute(
    "GasPool",
    "setAddresses",
    await musd.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetGasPoolAddresses"]
func.dependencies = ["GasPool", "MUSD", "TroveManager"]
