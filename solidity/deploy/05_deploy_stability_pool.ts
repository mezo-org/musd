import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("StabilityPool")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using StabilityPool at ${deployment.address}`)
  } else {
    log("Deploying StabilityPool contract...")

    await deployments.deploy("StabilityPool", {
      contract: "contracts/StabilityPool.sol:StabilityPool",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["StabilityPool"]
