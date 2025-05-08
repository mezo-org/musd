import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"
import { ZERO_ADDRESS } from "../helpers/constants.ts"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork } =
    await setupDeploymentBoilerplate(hre)

  const {
    borrowerOperations,
    borrowerOperationsSignatures,
    interestRateManager,
  } = await newFetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

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
  "NewBorrowerOperations",
  "NewBorrowerOperationsSignatures",
  "NewInterestRateManager",
]
func.skip = async (hre: HardhatRuntimeEnvironment) => true
