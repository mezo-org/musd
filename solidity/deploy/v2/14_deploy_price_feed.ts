import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("PriceFeedV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using PriceFeedV2 at ${deployment.address}`)
  } else {
    log("Deploying PriceFeedV2 contract...")

    await deployments.deploy("PriceFeedV2", {
      contract: "contracts/v2/PriceFeedV2.sol:PriceFeedV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["PriceFeedV2"]
