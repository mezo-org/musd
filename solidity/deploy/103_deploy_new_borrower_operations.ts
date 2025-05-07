import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy } = await setupDeploymentBoilerplate(hre)

  // Deploy new instance with a different name
  await getOrDeployProxy("NewBorrowerOperations", {
    contractName: "BorrowerOperations",
  })
}

export default func
func.tags = ["NewBorrowerOperations"]
