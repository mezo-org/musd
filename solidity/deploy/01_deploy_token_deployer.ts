import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  setupDeploymentBoilerplate,
  waitConfirmationsNumber,
} from "../helpers/deploy-helpers"
import { deployWithSingletonFactory } from "../helpers/erc2470"
import { TokenDeployer } from "../typechain"
import {
  TOKEN_DEPLOYER_INIT_CODE,
  TOKEN_DEPLOYER_SALT,
} from "./constants/token-deployer"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { isHardhatNetwork, getValidDeployment, log, deployer } =
    await setupDeploymentBoilerplate(hre)
  const { network } = hre

  // Short-circuit. On Hardhat, we do not use the real token contract for tests.
  // Instead, the MUSDTester is resolved as MUSD.
  if (isHardhatNetwork) {
    log("No need for TokenDeployer on Hardhat network, skipping")
    return
  }

  const tokenDeployerDeployment = await getValidDeployment("TokenDeployer")
  if (tokenDeployerDeployment) {
    log(`Using TokenDeployer at ${tokenDeployerDeployment.address}`)
  } else {
    log("Deploying the TokenDeployer...")

    await deployWithSingletonFactory<TokenDeployer>("TokenDeployer", {
      contractName: "contracts/token/TokenDeployer.sol:TokenDeployer",
      from: deployer,
      salt: TOKEN_DEPLOYER_SALT,
      initCode: TOKEN_DEPLOYER_INIT_CODE,
      confirmations: waitConfirmationsNumber(network.name),
    })
  }
}

export default func

func.tags = ["TokenDeployer"]
