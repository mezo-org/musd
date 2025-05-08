import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { MAX_BYTES_32 } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, troveManager } =
    await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "NewSortedTroves",
    "setParams",
    MAX_BYTES_32,
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetSortedTrovesAddresses"]
func.dependencies = [
  "NewBorrowerOperations",
  "NewSortedTroves",
  "NewTroveManager",
]
func.skip = async (hre: HardhatRuntimeEnvironment) => true
