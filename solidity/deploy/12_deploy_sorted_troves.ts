import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("SortedTrovesV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using SortedTrovesV2 at ${deployment.address}`)
  } else {
    log("Deploying SortedTrovesV2 contract...")

    await deployments.deploy("SortedTrovesV2", {
      contract: "contracts/SortedTrovesV2.sol:SortedTrovesV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["SortedTrovesV2"]
