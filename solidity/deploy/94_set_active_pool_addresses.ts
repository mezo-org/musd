import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const {
    activePool,
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    interestRateManager,
    stabilityPool,
    troveManager,
  } = await fetchAllDeployedContracts(isHardhatNetwork)

  await activePool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      ZERO_ADDRESS,
      await collSurplusPool.getAddress(),
      await defaultPool.getAddress(),
      await interestRateManager.getAddress(),
      await troveManager.getAddress(),
      await stabilityPool.getAddress(),
    )
}

export default func

func.tags = ["SetAddresses", "SetActivePoolAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "CollSurplusPool",
  "DefaultPool",
  "StabilityPool",
  "TroveManager",
]
