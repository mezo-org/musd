import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, musd } = await newFetchAllDeployedContracts(
    isHardhatNetwork,
    isFuzzTestingNetwork,
  )

  await execute(
    "NewPCV",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await musd.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetPCVAddresses"]
func.dependencies = ["NewBorrowerOperations", "MUSD", "NewPCV"]
