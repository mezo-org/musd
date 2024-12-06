import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  getDeployedContract,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

import { BorrowerOperations, PCV } from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")

  const musd = isHardhatNetwork
    ? await getDeployedContract("MUSDTester")
    : await getDeployedContract("MUSD")

  const pcv: PCV = await getDeployedContract("PCV")

  await pcv
    .connect(deployer)
    .setAddresses(
      await musd.getAddress(),
      await borrowerOperations.getAddress(),
      ZERO_ADDRESS,
    )
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = ["BorrowerOperations", "MUSD", "PCV"]
