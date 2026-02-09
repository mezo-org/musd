import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  setupDeploymentBoilerplate,
  isNoopNetwork,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy, getOrDeploy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  const shouldDeployNoOp = isNoopNetwork(hre)

  if (shouldDeployNoOp) {
    // Deploy NoOp contract for specified networks
    // Use "TroveManager" as deployment name so other scripts can find it
    await getOrDeploy("TroveManager", {
      contract: "NoOp",
    })
  } else {
    await getOrDeployProxy(
      isHardhatNetwork ? "TroveManagerTester" : "TroveManager",
    )
  }
}

export default func

func.tags = ["TroveManager"]
