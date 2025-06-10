import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const {
    activePool,
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    interestRateManager,
    stabilityPool,
  } = await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "BorrowerOperationsSignatures",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await collSurplusPool.getAddress(),
    await defaultPool.getAddress(),
    await interestRateManager.getAddress(),
    await stabilityPool.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetBorrowerOperationsSignatures"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "BorrowerOperationsSignatures",
  "CollSurplusPool",
  "DefaultPool",
  "InterestRateManager",
  "StabilityPool",
]
