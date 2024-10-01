import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers.ts"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("StabilityPoolV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using StabilityPoolV2 at ${deployment.address}`)
  } else {
    log("Deploying StabilityPoolV2 contract...")

    await deployments.deploy("StabilityPoolV2", {
      contract: "contracts/v2/StabilityPoolV2.sol:StabilityPoolV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["StabilityPoolV2"]
