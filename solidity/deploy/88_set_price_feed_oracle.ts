import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)
  const { mockAggregator } = await fetchAllDeployedContracts(isHardhatNetwork)

  await execute("PriceFeed", "setOracle", await mockAggregator.getAddress())
}

export default func

func.tags = ["SetAddresses", "SetPriceFeedOracle"]
func.dependencies = ["PriceFeed", "MockAggregator"]
