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
    gasPool,
    interestRateManager,
    musd,
    pcv,
    priceFeed,
    reversibleCallOptionManager,
    sortedTroves,
    stabilityPool,
  } = await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    isHardhatNetwork ? "TroveManagerTester" : "TroveManager",
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
    await reversibleCallOptionManager.getAddress(),
    await sortedTroves.getAddress(),
    await stabilityPool.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetTroveManagerAddresses"]
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
  "ReversibleCallOptionManager",
  "SortedTroves",
  "StabilityPool",
  "TroveManager",
]
