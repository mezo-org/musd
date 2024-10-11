import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("CollSurplusPool")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using CollSurplusPool at ${deployment.address}`)
  } else {
    log("Deploying CollSurplusPool contract...")

    await deployments.deploy("CollSurplusPool", {
      contract: "contracts/CollSurplusPool.sol:CollSurplusPool",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["CollSurplusPool"]
