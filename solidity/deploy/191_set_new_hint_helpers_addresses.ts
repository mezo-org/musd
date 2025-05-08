import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, sortedTroves, troveManager } =
    await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "NewHintHelpers",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await sortedTroves.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetHintHelpersAddresses"]
func.dependencies = [
  "NewBorrowerOperations",
  "NewHintHelpers",
  "NewSortedTroves",
  "NewTroveManager",
]
