import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

import {
  ActivePool,
  DefaultPool,
  TroveManager,
  TroveManagerTester,
} from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const activePool: ActivePool = await getDeployedContract("ActivePool")
  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")

  const troveManager: TroveManager | TroveManagerTester = isHardhatNetwork
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

  await defaultPool
    .connect(deployer)
    .setAddresses(
      await troveManager.getAddress(),
      await activePool.getAddress(),
      ZERO_ADDRESS,
    )
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = ["ActivePool", "DefaultPool", "TroveManager"]
