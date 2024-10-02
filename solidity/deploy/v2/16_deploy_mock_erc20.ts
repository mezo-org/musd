import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers.ts"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("MockERC20V2")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using MockERC20V2 at ${deployment.address}`)
  } else {
    log("Deploying MockERC20V2 contract...")

    await deployments.deploy("MockERC20V2", {
      contract: "contracts/v2/tests/MockERC20V2.sol:MockERC20V2",
      args: ["ERC Test", "TST", 100000],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["MockERC20V2"]
