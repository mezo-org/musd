import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy, getOrDeploy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)
  await getOrDeploy("PriceFeed")

  if (isHardhatNetwork) {
    await deploy("UnconnectedPriceFeed", {
      contract: "PriceFeed",
    })
  }
}

export default func

func.tags = ["PriceFeed"]
