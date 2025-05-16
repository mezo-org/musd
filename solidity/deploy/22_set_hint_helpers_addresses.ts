import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, sortedTroves, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "HintHelpers",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await sortedTroves.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetHintHelpersAddresses"]
func.dependencies = [
  "BorrowerOperations",
  "HintHelpers",
  "SortedTroves",
  "TroveManager",
]
