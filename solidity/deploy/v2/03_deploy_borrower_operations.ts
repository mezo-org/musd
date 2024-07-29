import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  // Deploy BorrowerOperationsV2
  const deploymentV2 = await deployments.getOrNull("BorrowerOperationsV2")
  if (deploymentV2 && helpers.address.isValid(deploymentV2.address)) {
    log(`Using BorrowerOperationsV2 at ${deploymentV2.address}`)
  } else {
    log("Deploying BorrowerOperations contract...")

    await deployments.deploy("BorrowerOperationsV2", {
      contract: "contracts/v2/BorrowerOperationsV2.sol:BorrowerOperationsV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["BorrowerOperationsV2"]
