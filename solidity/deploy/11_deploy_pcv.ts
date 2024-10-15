import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("PCV")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using PCV at ${deployment.address}`)
  } else {
    log("Deploying PCV contract...")

    await deployments.deploy("PCV", {
      contract: "PCV",
      args: [7200],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["PCV"]
