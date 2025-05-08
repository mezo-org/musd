import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { activePool, borrowerOperations, musd, pcv, troveManager } =
    await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    isFuzzTestingNetwork
      ? "NewInterestRateManagerTester"
      : "NewInterestRateManager",
    "setAddresses",
    await activePool.getAddress(),
    await borrowerOperations.getAddress(),
    await musd.getAddress(),
    await pcv.getAddress(),
    await troveManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "NewSetInterestRateManagerAddresses"]
func.dependencies = [
  "NewActivePool",
  "NewBorrowerOperations",
  "MUSD",
  "NewInterestRateManager",
  "NewPCV",
  "NewTroveManager",
]
