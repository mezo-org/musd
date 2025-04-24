import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { MAX_BYTES_32 } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, troveManager } = await fetchAllDeployedContracts(
    isHardhatNetwork,
    isFuzzTestingNetwork,
  )

  await execute(
    "SortedTroves",
    "setParams",
    MAX_BYTES_32,
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetSortedTrovesAddresses"]
func.dependencies = ["BorrowerOperations", "SortedTroves", "TroveManager"]
