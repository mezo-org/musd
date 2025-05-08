import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { musd, troveManager } = await newFetchAllDeployedContracts(
    isHardhatNetwork,
    isFuzzTestingNetwork,
  )

  await execute(
    "NewGasPool",
    "setAddresses",
    await musd.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetGasPoolAddresses"]
func.dependencies = ["NewGasPool", "MUSD", "NewTroveManager"]
func.skip = async (hre: HardhatRuntimeEnvironment) => true
