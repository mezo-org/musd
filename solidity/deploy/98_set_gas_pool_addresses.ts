import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.helpers.signers.getNamedSigners()
  const { isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { gasPool, musd, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await gasPool
    .connect(deployer)
    .setAddresses(await troveManager.getAddress(), await musd.getAddress())
}

export default func

func.tags = ["SetAddresses"]
func.dependencies = ["GasPool", "MUSD", "TroveManager"]
