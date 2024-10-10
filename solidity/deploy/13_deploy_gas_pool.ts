import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("GasPoolV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using GasPoolV2 at ${deployment.address}`)
  } else {
    log("Deploying GasPoolV2 contract...")

    await deployments.deploy("GasPoolV2", {
      contract: "contracts/GasPoolV2.sol:GasPoolV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["GasPoolV2"]
