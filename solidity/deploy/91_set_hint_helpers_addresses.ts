import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import {
  HintHelpers,
  SortedTroves,
  TroveManager,
  TroveManagerTester,
} from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const hintHelpers: HintHelpers = await getDeployedContract("HintHelpers")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")

  const troveManager: TroveManager | TroveManagerTester = isHardhatNetwork
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

  await hintHelpers
    .connect(deployer)
    .setAddresses(
      await sortedTroves.getAddress(),
      await troveManager.getAddress(),
    )
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = ["HintHelpers", "SortedTroves", "TroveManager"]
