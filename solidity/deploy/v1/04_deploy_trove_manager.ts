import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  // Deploy TroveManager v1
  const deploymentV1 = await deployments.getOrNull("TroveManagerV1")
  if (deploymentV1 && helpers.address.isValid(deploymentV1.address)) {
    log(`Using TroveManagerV1 at ${deploymentV1.address}`)
  } else {
    log("Deploying TroveManagerV1 contract...")

    await deployments.deploy("TroveManagerV1", {
      contract: "contracts/v1/TroveManager.sol:TroveManager", // Specify the path to the v1 contract
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["TroveManagerV1"]
