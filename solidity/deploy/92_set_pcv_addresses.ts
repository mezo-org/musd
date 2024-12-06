import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

import { ZERO_ADDRESS } from "../helpers/constants"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { borrowerOperations, musd, pcv } =
    await fetchAllDeployedContracts(isHardhatNetwork)

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
