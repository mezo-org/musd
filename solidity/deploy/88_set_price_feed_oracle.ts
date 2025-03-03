import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  EXTERNAL_ADDRESSES,
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, network } =
    await setupDeploymentBoilerplate(hre)

  let aggregatorAddress
  if (isHardhatNetwork) {
    const { mockAggregator } = await fetchAllDeployedContracts(isHardhatNetwork)
    aggregatorAddress = await mockAggregator.getAddress()
  } else if (network.name in EXTERNAL_ADDRESSES) {
    aggregatorAddress = EXTERNAL_ADDRESSES[network.name].PriceOracleCaller
  } else {
    throw Error(`${network.name} does not have a PriceOracleCaller set`)
  }

  await execute("PriceFeed", "setOracle", aggregatorAddress)
}

export default func

func.tags = ["SetAddresses", "SetPriceFeedOracle"]
func.dependencies = ["PriceFeed", "MockAggregator"]
