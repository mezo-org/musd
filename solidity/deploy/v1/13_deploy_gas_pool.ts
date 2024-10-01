import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { waitConfirmationsNumber } from "../../helpers/deploy-helpers.ts"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("GasPool")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using GasPool at ${deployment.address}`)
  } else {
    log("Deploying GasPool contract...")

    await deployments.deploy("GasPool", {
      contract: "contracts/v1/GasPool.sol:GasPool",
      args: [],
      from: deployer,
      log: true,
      waitConfirmations: waitConfirmationsNumber(hre),
    })
  }
}

export default func

func.tags = ["GasPool"]
