import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

import {
  ActivePool,
  BorrowerOperations,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManager,
  TroveManagerTester,
} from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const activePool: ActivePool = await getDeployedContract("ActivePool")

  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")

  const musd = isHardhatNetwork
    ? await getDeployedContract("MUSDTester")
    : await getDeployedContract("MUSD")

  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")

  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")

  const troveManager: TroveManager | TroveManagerTester = isHardhatNetwork
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

  await stabilityPool
    .connect(deployer)
    .setAddresses(
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
      await activePool.getAddress(),
      await musd.getAddress(),
      await sortedTroves.getAddress(),
      await priceFeed.getAddress(),
      ZERO_ADDRESS,
    )
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = [
  "ActivePool",
  "BorrowerOperations",
  "MUSD",
  "PriceFeed",
  "SortedTroves",
  "StabilityPool",
  "TroveManager",
]
