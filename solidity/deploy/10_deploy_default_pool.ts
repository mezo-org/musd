import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("DefaultPoolV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using DefaultPoolV2 at ${deployment.address}`)
  } else {
    log("Deploying DefaultPoolV2 contract...")

    await deployments.deploy("DefaultPoolV2", {
      contract: "contracts/v2/DefaultPoolV2.sol:DefaultPoolV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["DefaultPoolV2"]
