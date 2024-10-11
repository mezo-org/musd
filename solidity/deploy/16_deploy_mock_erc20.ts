import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("MockERC20")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using MockERC20 at ${deployment.address}`)
  } else {
    log("Deploying MockERC20 contract...")

    await deployments.deploy("MockERC20", {
      contract: "contracts/tests/MockERC20.sol:MockERC20",
      args: ["ERC Test", "TST", 100000],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["MockERC20"]
