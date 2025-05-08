import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const {
    activePool,
    borrowerOperationsSignatures,
    collSurplusPool,
    defaultPool,
    gasPool,
    governableVariables,
    interestRateManager,
    musd,
    pcv,
    priceFeed,
    sortedTroves,
    stabilityPool,
    troveManager,
  } = await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute("NewBorrowerOperations", "setAddresses", [
    await activePool.getAddress(),
    await borrowerOperationsSignatures.getAddress(),
    await collSurplusPool.getAddress(),
    await defaultPool.getAddress(),
    await gasPool.getAddress(),
    await governableVariables.getAddress(),
    await interestRateManager.getAddress(),
    await musd.getAddress(),
    await pcv.getAddress(),
    await priceFeed.getAddress(),
    await sortedTroves.getAddress(),
    await stabilityPool.getAddress(),
    await troveManager.getAddress(),
  ])
}

export default func

func.tags = ["SetAddresses", "NewSetBorrowerOperationsAddresses"]
func.dependencies = [
  "NewActivePool",
  "NewBorrowerOperations",
  "NewCollSurplusPool",
  "NewDefaultPool",
  "NewGasPool",
  "NewInterestRateManager",
  "MUSD",
  "NewPCV",
  "PriceFeed",
  "NewSortedTroves",
  "NewStabilityPool",
  "NewTroveManager",
]
