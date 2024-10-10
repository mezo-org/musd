import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  let deployment = await deployments.getOrNull("TroveManagerV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using TroveManagerV2 at ${deployment.address}`)
  } else {
    log("Deploying TroveManagervV2 contract...")

    await deployments.deploy("TroveManagerV2", {
      contract: "contracts/v2/TroveManagerV2.sol:TroveManagerV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }

  deployment = await deployments.getOrNull("TroveManagerTesterV2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using TroveManagerTesterV2 at ${deployment.address}`)
  } else {
    log("Deploying TroveManagerTesterV2 contract...")

    await deployments.deploy("TroveManagerTesterV2", {
      contract:
        "contracts/v2/tests/TroveManagerTesterV2.sol:TroveManagerTesterV2",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["TroveManagerV2"]
