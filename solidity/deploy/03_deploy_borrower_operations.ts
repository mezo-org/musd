import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, getOrDeploy, getOrDeployProxy } =
    await setupDeploymentBoilerplate(hre)
  const borrowerOperationsTroves = await getOrDeploy("BorrowerOperationsTroves")
  await getOrDeployProxy("BorrowerOperations", {
    factoryOpts: {
      signer: deployer,
      libraries: {
        BorrowOperationsTroves: borrowerOperationsTroves.address,
      },
    },
  })
}

export default func

func.tags = ["BorrowerOperations"]
