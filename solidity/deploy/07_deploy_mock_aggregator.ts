import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeploy } = await setupDeploymentBoilerplate(hre)

  // FIXME: Use a real aggregator in non-hardhat environments
  await getOrDeploy("MockAggregator", { args: ["18"] })
}

export default func

func.tags = ["MockAggregator"]

// Only execute for hardhat
func.skip = async (hre: HardhatRuntimeEnvironment): Promise<boolean> =>
  hre.network.name !== "hardhat"
