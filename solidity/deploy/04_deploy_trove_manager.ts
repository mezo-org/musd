import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  console.log()

  const deployment = await deployments.getOrNull("TroveManager")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using TroveManager at ${deployment.address}`)
  } else {
    log("Deploying TroveManager contract...")

    await deployments.deploy("TroveManager", {
      contract: "TroveManager",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["TroveManager"]
