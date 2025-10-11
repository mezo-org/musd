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
    gasPool,
    musd,
    priceFeed,
    troveManager,
  } = await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await execute(
    "ReversibleCallOptionManager",
    "setAddresses",
    await troveManager.getAddress(),
    await priceFeed.getAddress(),
    await activePool.getAddress(),
    await musd.getAddress(),
    await gasPool.getAddress(),
  )
}

export default func

func.tags = ["SetAddresses", "SetReversibleCallOptionManagerAddresses"]
func.dependencies = [
  "ActivePool",
  "GasPool",
  "MUSD",
  "PriceFeed",
  "ReversibleCallOptionManager",
  "TroveManager",
]