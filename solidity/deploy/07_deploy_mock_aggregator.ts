import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeploy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  if (isHardhatNetwork) {
    await getOrDeploy("MockAggregator", { args: ["18"] })
  }
}

export default func

func.tags = ["MockAggregator"]
