import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeploy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  await getOrDeploy("TroveManager")
  if (isHardhatNetwork) {
    await getOrDeploy("TroveManagerTester")
  }
}

export default func

func.tags = ["TroveManager"]
