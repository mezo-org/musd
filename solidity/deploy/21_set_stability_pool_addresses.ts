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
    musd,
    priceFeed,
    sortedTroves,
    troveManager,
  } = await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "StabilityPool",
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

func.tags = ["SetAddresses", "SetStabilityPoolAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "MUSD",
  "PriceFeed",
  "SortedTroves",
  "StabilityPool",
  "TroveManager",
]
