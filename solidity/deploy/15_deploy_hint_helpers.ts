import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("HintHelpers")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using HintHelpers at ${deployment.address}`)
  } else {
    log("Deploying HintHelpers contract...")

    await deployments.deploy("HintHelpers", {
      contract: "contracts/HintHelpers.sol:HintHelpers",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["HintHelpers"]
