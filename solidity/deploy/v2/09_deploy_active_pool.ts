import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers.ts"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("ActivePoolV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using ActivePoolV2 at ${deployment.address}`)
  } else {
    log("Deploying ActivePoolV2 contract...")

    await deployments.deploy("ActivePoolV2", {
      contract: "contracts/v2/ActivePoolV2.sol:ActivePoolV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["ActivePoolV2"]
