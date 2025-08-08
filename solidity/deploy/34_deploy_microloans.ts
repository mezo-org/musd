import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  fetchAllDeployedContracts,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {
    isHardhatNetwork,
    isFuzzTestingNetwork,
    getOrDeployProxy,
    governance,
  } = await setupDeploymentBoilerplate(hre)

  const { musd, borrowerOperations, troveManager, priceFeed } =
    await fetchAllDeployedContracts(isHardhatNetwork, isFuzzTestingNetwork)

  await getOrDeployProxy("Microloans", {
    initializerArgs: [
      await musd.getAddress(),
      await borrowerOperations.getAddress(),
      await troveManager.getAddress(),
      await priceFeed.getAddress(),
    ],
    proxyOpts: {
      kind: "transparent",
      initialOwner: governance.address,
    },
  })
}

export default func

func.tags = ["Microloans"]
func.dependencies = ["BorrowerOperations", "TroveManager"]
