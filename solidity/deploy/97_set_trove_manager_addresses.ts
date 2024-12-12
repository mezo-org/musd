import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

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
    troveManager,
  } = await fetchAllDeployedContracts(isHardhatNetwork)

  await troveManager
    .connect(deployer)
    .setAddresses(
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

func.tags = ["SetAddresses", "SetTroveManagerAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "CollSurplusPool",
  "DefaultPool",
  "GasPool",
  "MUSD",
  "PCV",
  "PriceFeed",
  "SortedTroves",
  "StabilityPool",
  "TroveManager",
]
