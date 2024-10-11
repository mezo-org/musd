import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("BorrowerOperations")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using BorrowerOperations at ${deployment.address}`)
  } else {
    log("Deploying BorrowerOperations contract...")

    await deployments.deploy("BorrowerOperations", {
      contract: "contracts/BorrowerOperations.sol:BorrowerOperations",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["BorrowerOperations"]
