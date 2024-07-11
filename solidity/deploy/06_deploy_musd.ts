import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("MUSD")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using MUSD at ${deployment.address}`)
  } else {
    log("Deploying MUSD contract...")
    const borrowerOperations = await deployments.get("BorrowerOperations")
    const stabilityPool = await deployments.get("StabilityPool")
    const troveManager = await deployments.get("TroveManager")
    const ZERO_ADDRESS = `0x${"0".repeat(40)}`
    const delay = 90 * 24 * 60 * 60 // 90 days in seconds

    await deployments.deploy("MUSD", {
      contract: "MUSD",
      args: [
        "Mezo USD",
        "MUSD",
        troveManager.address,
        stabilityPool.address,
        borrowerOperations.address,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        delay,
      ],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })

    await deployments.deploy("MUSDTester", {
      contract: "MUSDTester",
      args: [
        troveManager.address,
        stabilityPool.address,
        borrowerOperations.address,
        10,
      ],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["MUSD"]
func.dependencies = ["BorrowerOperations", "TroveManager", "StabilityPool"]
