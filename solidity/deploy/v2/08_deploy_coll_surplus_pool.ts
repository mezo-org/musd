import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("CollSurplusPoolV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using CollSurplusPoolV2 at ${deployment.address}`)
  } else {
    log("Deploying CollSurplusPoolV2 contract...")

    await deployments.deploy("CollSurplusPoolV2", {
      contract: "contracts/v2/CollSurplusPoolV2.sol:CollSurplusPoolV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["CollSurplusPoolV2"]
