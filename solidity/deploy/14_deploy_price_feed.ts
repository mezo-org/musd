import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, deployProxy, getOrDeployProxy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  await getOrDeployProxy("PriceFeed", {
    initializerArgs: [deployer.address],
  })

  if (isHardhatNetwork) {
    await deployProxy("UnconnectedPriceFeed", {
      contractName: "PriceFeed",
      initializerArgs: [deployer.address],
    })
  }
}

export default func

func.tags = ["PriceFeed"]
