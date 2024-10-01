import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers.ts"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("MockAggregator")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using MockAggregator at ${deployment.address}`)
  } else {
    log("Deploying MockAggregatorV2.sol contract...")

    await deployments.deploy("MockAggregator", {
      contract: "contracts/v1/tests/MockAggregatorV2.sol:MockAggregatorV2.sol",
      args: ["18"],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["MockAggregator"]
