import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy } = await setupDeploymentBoilerplate(hre)

  const isFuzzTestingNetwork = hre.network.name === "matsnet_fuzz"

  const contractName = isFuzzTestingNetwork
    ? "InterestRateManagerTester"
    : "InterestRateManager"

  await getOrDeployProxy(contractName)
}

export default func

func.tags = ["InterestRateManager"]
