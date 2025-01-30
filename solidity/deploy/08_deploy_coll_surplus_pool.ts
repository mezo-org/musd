import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, getOrDeployProxy } = await setupDeploymentBoilerplate(hre)
  await getOrDeployProxy("CollSurplusPool", {
    initializerArgs: [deployer.address],
  })
}

export default func

func.tags = ["CollSurplusPool"]
