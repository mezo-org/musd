import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const {
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    interestRateManager,
    stabilityPool,
    troveManager,
  } = await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "NewActivePool",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await collSurplusPool.getAddress(),
    await defaultPool.getAddress(),
    await interestRateManager.getAddress(),
    await stabilityPool.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetActivePoolAddresses"]
func.dependencies = [
  "NewActivePool",
  "NewBorrowerOperations",
  "NewCollSurplusPool",
  "NewDefaultPool",
  "NewStabilityPool",
  "NewTroveManager",
]
