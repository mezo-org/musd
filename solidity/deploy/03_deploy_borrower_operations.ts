import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getOrDeployProxy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)
  await getOrDeployProxy("BorrowerOperations")

  // The MUSD tests want another BorrowerOperations contract for testing
  // upgrades. So, we deploy one named "NewBorrowerOperationsTroves" to use in
  // those tests, but only in hardhat.
  if (isHardhatNetwork) {
    await getOrDeployProxy("NewBorrowerOperations", {
      contractName: "BorrowerOperations",
    })
  }
}

export default func

func.tags = ["BorrowerOperations"]
