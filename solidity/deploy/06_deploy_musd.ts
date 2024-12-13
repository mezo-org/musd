import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {
    deployments,
    getOrDeploy,
    getValidDeployment,
    log,
    deploy,
    isHardhatNetwork,
  } = await setupDeploymentBoilerplate(hre)

  const borrowerOperations = await deployments.get("BorrowerOperations")
  const stabilityPool = await deployments.get("StabilityPool")
  const troveManager = await deployments.get("TroveManagerTester")
  const interestRateManager = await deployments.get("InterestRateManager")

  const musd = await getValidDeployment("MUSD")
  if (musd) {
    log(`Using MUSD at ${musd.address}`)
  } else {
    const delay = 90 * 24 * 60 * 60 // 90 days in seconds

    await deploy("MUSD", {
      contract: "MUSD",
      args: [
        "Mezo USD",
        "MUSD",
        troveManager.address,
        stabilityPool.address,
        borrowerOperations.address,
        interestRateManager.address,
        delay,
      ],
    })
  }

  if (isHardhatNetwork) {
    await getOrDeploy("MUSDTester", {
      args: [
        troveManager.address,
        stabilityPool.address,
        borrowerOperations.address,
        interestRateManager.address,
        10,
      ],
    })
  }
}

export default func

func.tags = ["MUSD"]
func.dependencies = ["BorrowerOperations", "TroveManager", "StabilityPool"]
