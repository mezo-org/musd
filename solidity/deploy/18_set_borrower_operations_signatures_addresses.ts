import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { activePool, borrowerOperations, interestRateManager } =
    await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "BorrowerOperationsSignatures",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await interestRateManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetBorrowerOperationsSignatures"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "BorrowerOperationsSignatures",
  "InterestRateManager",
]
