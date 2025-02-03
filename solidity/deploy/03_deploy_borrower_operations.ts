import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeploy, getOrDeployProxy } =
    await setupDeploymentBoilerplate(hre)
  const typeHashes = await getOrDeploy("TypeHashes")
  await getOrDeployProxy("BorrowerOperations", {
    factoryOpts: {
      libraries: {
        TypeHashes: typeHashes,
      },
    },
  })
}

export default func

func.tags = ["BorrowerOperations"]
