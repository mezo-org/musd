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
    // Use "BorrowerOperations" as deployment name so other scripts can find it
    await getOrDeploy("BorrowerOperations", {
      contract: "NoOp",
    })
  } else {
    await getOrDeployProxy("BorrowerOperations")

    // The MUSD tests want another BorrowerOperations contract for testing
    // upgrades. So, we deploy one named "NewBorrowerOperations" to use in
    // those tests, but only in hardhat.
    if (isHardhatNetwork) {
      await getOrDeployProxy("NewBorrowerOperations", {
        contractName: "BorrowerOperations",
      })
    }
  }
}

export default func

func.tags = ["BorrowerOperations"]
