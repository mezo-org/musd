import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("HintHelpersV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using HintHelpersV2 at ${deployment.address}`)
  } else {
    log("Deploying HintHelpersV2 contract...")

    await deployments.deploy("HintHelpersV2", {
      contract: "contracts/HintHelpersV2.sol:HintHelpersV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["HintHelpersV2"]
