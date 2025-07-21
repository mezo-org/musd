import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { activePool, borrowerOperations, musd, pcv, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    isFuzzTestingNetwork ? "InterestRateManagerTester" : "InterestRateManager",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await musd.getAddress(),
    await pcv.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetInterestRateManagerAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "MUSD",
  "InterestRateManager",
  "PCV",
  "TroveManager",
]
