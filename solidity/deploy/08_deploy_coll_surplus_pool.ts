import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeploy } = await setupDeploymentBoilerplate(hre)
  await getOrDeploy("CollSurplusPool")
}

export default func

func.tags = ["CollSurplusPool"]
