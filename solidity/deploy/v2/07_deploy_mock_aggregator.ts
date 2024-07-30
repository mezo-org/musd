import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deploymentV2 = await deployments.getOrNull("MockAggregatorV2")
  if (deploymentV2 && helpers.address.isValid(deploymentV2.address)) {
    log(`Using MockAggregator at ${deploymentV2.address}`)
  } else {
    log("Deploying MockAggregator contract...")

    await deployments.deploy("MockAggregatorV2", {
      contract: "contracts/v2/tests/MockAggregatorV2.sol:MockAggregatorV2",
      args: ["18"],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["MockAggregatorV2"]
