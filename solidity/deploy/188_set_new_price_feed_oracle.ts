import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  EXTERNAL_ADDRESSES,
  newFetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { execute, isHardhatNetwork, isFuzzTestingNetwork, network } =
    await setupDeploymentBoilerplate(hre)

  let aggregatorAddress
  if (isHardhatNetwork || isFuzzTestingNetwork) {
    const { mockAggregator } = await newFetchAllDeployedContracts(
      isHardhatNetwork,
      isFuzzTestingNetwork,
    )
    aggregatorAddress = await mockAggregator.getAddress()
  } else if (network.name in EXTERNAL_ADDRESSES) {
    aggregatorAddress = EXTERNAL_ADDRESSES[network.name].PriceOracleCaller
  } else {
    throw Error(`${network.name} does not have a PriceOracleCaller set`)
  }

  await execute("PriceFeed", "setOracle", aggregatorAddress)
}

export default func

func.tags = ["SetAddresses", "NewSetPriceFeedOracle"]
func.dependencies = ["PriceFeed", "MockAggregator"]
