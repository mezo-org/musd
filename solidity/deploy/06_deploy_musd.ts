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

  const isFuzzTestingNetwork = hre.network.name === "matsnet_fuzz"

  const interestRateManagerName = isFuzzTestingNetwork
    ? "InterestRateManagerTester"
    : "InterestRateManager"

  const interestRateManager = await deployments.get(interestRateManagerName)
  const troveManager = await deployments.get(
    isHardhatNetwork ? "TroveManagerTester" : "TroveManager",
  )
  const stabilityPool = await deployments.get("StabilityPool")

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
func.dependencies = [
  "BorrowerOperations",
  "InterestRateManager",
  "StabilityPool",
  "TroveManager",
]
