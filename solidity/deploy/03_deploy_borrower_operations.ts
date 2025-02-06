import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, getOrDeploy, getOrDeployProxy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)
  const borrowerOperationsTroves = await getOrDeploy("BorrowerOperationsTroves")
  await getOrDeployProxy("BorrowerOperations", {
    factoryOpts: {
      signer: deployer,
      libraries: {
        BorrowerOperationsTroves: borrowerOperationsTroves.address,
      },
    },
  })

  // The MUSD tests want another BorrowerOperations contract for testing
  // upgrades. So, we deploy one named "NewBorrowerOperationsTroves" to use in
  // those tests, but only in hardhat.
  if (isHardhatNetwork) {
    const newBorrowerOperationsTroves = await getOrDeploy(
      "NewBorrowerOperationsTroves",
      {
        contract: "BorrowerOperationsTroves",
      },
    )

    await getOrDeployProxy("NewBorrowerOperations", {
      contractName: "BorrowerOperations",
      factoryOpts: {
        signer: deployer,
        libraries: {
          BorrowerOperationsTroves: newBorrowerOperationsTroves.address,
        },
      },
    })
  }
}

export default func

func.tags = ["BorrowerOperations"]
