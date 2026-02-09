import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  setupDeploymentBoilerplate,
  isNoopNetwork,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy, getOrDeploy } =
    await setupDeploymentBoilerplate(hre)

  const shouldDeployNoOp = isNoopNetwork(hre)

  if (shouldDeployNoOp) {
    // Deploy NoOp contract for specified networks
    // Use "StabilityPool" as deployment name so other scripts can find it
    await getOrDeploy("StabilityPool", {
      contract: "NoOp",
    })
  } else {
    await getOrDeployProxy("StabilityPool")
  }
}

export default func

func.tags = ["StabilityPool"]
