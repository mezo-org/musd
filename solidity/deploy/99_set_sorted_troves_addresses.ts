import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { MAX_BYTES_32 } from "../helpers/constants"

import {
  BorrowerOperations,
  SortedTroves,
  TroveManager,
  TroveManagerTester,
} from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")

  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")

  const troveManager: TroveManager | TroveManagerTester = isHardhatNetwork
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

  await sortedTroves
    .connect(deployer)
    .setParams(
      MAX_BYTES_32,
      await troveManager.getAddress(),
      await borrowerOperations.getAddress(),
    )
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = ["BorrowerOperations", "SortedTroves", "TroveManager"]
