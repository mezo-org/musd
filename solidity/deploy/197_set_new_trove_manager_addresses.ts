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
    activePool,
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    gasPool,
    interestRateManager,
    musd,
    pcv,
    priceFeed,
    sortedTroves,
    stabilityPool,
  } = await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    isHardhatNetwork ? "NewTroveManagerTester" : "NewTroveManager",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await collSurplusPool.getAddress(),
    await defaultPool.getAddress(),
    await gasPool.getAddress(),
    await interestRateManager.getAddress(),
    await musd.getAddress(),
    await pcv.getAddress(),
    await priceFeed.getAddress(),
    await sortedTroves.getAddress(),
    await stabilityPool.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetTroveManagerAddresses"]
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
