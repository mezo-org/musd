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
    musd,
    priceFeed,
    sortedTroves,
    troveManager,
  } = await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "NewStabilityPool",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await musd.getAddress(),
    await priceFeed.getAddress(),
    await sortedTroves.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetStabilityPoolAddresses"]
func.dependencies = [
  "NewActivePool",
  "NewBorrowerOperations",
  "NewMUSD",
  "NewPriceFeed",
  "NewSortedTroves",
  "NewStabilityPool",
  "NewTroveManager",
]
func.skip = async (hre: HardhatRuntimeEnvironment) => true
