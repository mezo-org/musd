import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("MockAggregatorV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using MockAggregatorV2 at ${deployment.address}`)
  } else {
    log("Deploying MockAggregatorV2.sol contract...")

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
