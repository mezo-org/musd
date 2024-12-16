import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { sortedTroves, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "HintHelpers",
    "setAddresses",
    await sortedTroves.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetHintHelpersAddresses"]
func.dependencies = ["HintHelpers", "SortedTroves", "TroveManager"]
