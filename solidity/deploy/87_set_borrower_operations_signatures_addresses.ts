import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { borrowerOperations } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "BorrowerOperationsSignatures",
    "setAddresses",
    await borrowerOperations.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetBorrowerOperationsSignatures"]
func.dependencies = ["BorrowerOperations", "BorrowerOperationsSignatures"]
