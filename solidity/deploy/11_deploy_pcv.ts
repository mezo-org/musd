import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("PCVV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using PCVV2 at ${deployment.address}`)
  } else {
    log("Deploying PCVV2 contract...")

    await deployments.deploy("PCVV2", {
      contract: "contracts/PCVV2.sol:PCVV2",
      args: [7200],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["PCVV2"]
