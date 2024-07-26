import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  // Deploy TroveManager v2
  const deploymentV2 = await deployments.getOrNull("TroveManagerV2")
  if (deploymentV2 && helpers.address.isValid(deploymentV2.address)) {
    log(`Using TroveManagerV2 at ${deploymentV2.address}`)
  } else {
    log("Deploying TroveManagerV2 contract...")

    await deployments.deploy("TroveManagerV2", {
      contract: "contracts/v2/TroveManagerV2.sol:TroveManagerV2", // Specify the path to the v2 contract
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["TroveManagerV2"]
