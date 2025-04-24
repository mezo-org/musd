import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

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
  } = await fetchAllDeployedContracts(isHardhatNetwork)

  await execute(
    "BorrowerOperations",
    "setAddresses1",
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
  )

  await execute(
    "BorrowerOperations",
    "setAddresses2",
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetBorrowerOperationsAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "CollSurplusPool",
  "DefaultPool",
  "GasPool",
  "InterestRateManager",
  "MUSD",
  "PCV",
  "PriceFeed",
  "SortedTroves",
  "StabilityPool",
  "TroveManager",
]
