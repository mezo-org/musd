import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { hintHelpers, sortedTroves, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await hintHelpers
    .connect(deployer)
    .setAddresses(
      await sortedTroves.getAddress(),
      await troveManager.getAddress(),
    )
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = ["HintHelpers", "SortedTroves", "TroveManager"]
