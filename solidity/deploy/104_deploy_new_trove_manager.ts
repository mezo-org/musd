import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  const contractName = isHardhatNetwork ? "TroveManagerTester" : "TroveManager"

  await getOrDeployProxy("NewTroveManager", { contractName })
}

export default func

func.tags = ["NewTroveManager"]
