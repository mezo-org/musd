// solidity/deploy/200_set_new_contracts_in_musd.ts
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
    troveManager,
    stabilityPool,
    interestRateManager,
  } = await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  // Add them to MUSD's mint/burn lists
  await execute(
    "MUSD",
    "setSystemContracts",
    await troveManager.getAddress(),
    await stabilityPool.getAddress(),
    await borrowerOperations.getAddress(),
    await interestRateManager.getAddress(),
  )
}

export default func
func.tags = ["SetNewContractsInMUSD"]
func.dependencies = [
  "NewTroveManager",
  "NewStabilityPool",
  "NewBorrowerOperations",
  "NewInterestRateManager",
]
