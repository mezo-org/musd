import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, musd } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "PCV",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await musd.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetPCVAddresses"]
func.dependencies = ["BorrowerOperations", "MUSD", "PCV"]
