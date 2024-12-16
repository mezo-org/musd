import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { MAX_BYTES_32 } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "SortedTroves",
    "setParams",
    MAX_BYTES_32,
    await troveManager.getAddress(),
    await borrowerOperations.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetSortedTrovesAddresses"]
func.dependencies = ["BorrowerOperations", "SortedTroves", "TroveManager"]
