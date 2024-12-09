import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"
import { PriceFeed } from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { deploy, getOrDeploy, isHardhatNetwork } =
    await setupDeploymentBoilerplate(hre)

  await getOrDeploy("PriceFeed")

  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  const mockAggregator = await getDeployedContract("MockAggregator")
  // TODO: replace with a real aggregator
  await priceFeed.connect(deployer).setOracle(await mockAggregator.getAddress())

  if (isHardhatNetwork) {
    await deploy("UnconnectedPriceFeed", {
      contract: "PriceFeed",
    })
  }
}

export default func

func.tags = ["PriceFeed"]
func.dependencies = ["MockAggregator"]
