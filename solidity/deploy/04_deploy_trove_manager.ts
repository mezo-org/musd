import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"
import { NOOP_NETWORKS } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy, getOrDeploy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  const networkName = hre.network.name
  const shouldDeployNoOp = NOOP_NETWORKS.includes(networkName)

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
