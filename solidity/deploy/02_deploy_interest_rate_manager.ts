import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"
import { NOOP_NETWORKS } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy, getOrDeploy } = await setupDeploymentBoilerplate(hre)

  const networkName = hre.network.name
  const isFuzzTestingNetwork = networkName === "matsnet_fuzz"
  const shouldDeployNoOp = NOOP_NETWORKS.includes(networkName)

  if (shouldDeployNoOp) {
    // Deploy NoOp contract for specified networks
    // Use "InterestRateManager" as deployment name so other scripts can find it
    await getOrDeploy("InterestRateManager", {
      contract: "NoOp",
    })
  } else {
    const contractName = isFuzzTestingNetwork
      ? "InterestRateManagerTester"
      : "InterestRateManager"

    await getOrDeployProxy(contractName)
  }
}

export default func

func.tags = ["InterestRateManager"]
