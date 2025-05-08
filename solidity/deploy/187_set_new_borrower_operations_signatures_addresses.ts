import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, interestRateManager } =
    await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "NewBorrowerOperationsSignatures",
    "setAddresses",
    await borrowerOperations.getAddress(),
    await interestRateManager.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetBorrowerOperationsSignatures"]
func.dependencies = [
  "BorrowerOperations",
  "BorrowerOperationsSignatures",
  "InterestRateManager",
]
