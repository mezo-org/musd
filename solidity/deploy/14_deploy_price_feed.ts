import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployProxy, getOrDeployProxy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  await getOrDeployProxy("PriceFeed")

  if (isHardhatNetwork) {
    await deployProxy("UnconnectedPriceFeed", {
      contractName: "PriceFeed",
    })
  }
}

export default func

func.tags = ["PriceFeed"]
