import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer, isHardhatNetwork } = await setupDeploymentBoilerplate(hre)

  const { activePool, musd, interestRateManager, pcv, troveManager } =
    await fetchAllDeployedContracts(isHardhatNetwork)

  await interestRateManager
    .connect(deployer)
    .setAddresses(
      await activePool.getAddress(),
      musd.getAddress(),
      await pcv.getAddress(),
      await troveManager.getAddress(),
    )
}

export default func

func.tags = ["SetAddresses", "SetInterestRateManagerAddresses"]
func.dependencies = ["InterestRateManager", "PCV", "TroveManager"]
