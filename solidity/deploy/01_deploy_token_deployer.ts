import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  setupDeploymentBoilerplate,
  waitConfirmationsNumber,
} from "../helpers/deploy-helpers"
import { deployWithSingletonFactory } from "../helpers/erc2470"
import { TokenDeployer } from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { isHardhatNetwork, getValidDeployment, log, deployer } =
    await setupDeploymentBoilerplate(hre)
  const { ethers, helpers, network } = hre

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

    const deployTx = await deployWithSingletonFactory<TokenDeployer>(
      "TokenDeployer",
      {
        contractName: "contracts/token/TokenDeployer.sol:TokenDeployer",
        from: deployer,
        salt: ethers.keccak256(
          ethers.toUtf8Bytes(
            "Bank on yourself. Bring everyday finance to your Bitcoin.",
          ),
        ),
        confirmations: waitConfirmationsNumber(network.name),
      },
    )
    await helpers.etherscan.verify(deployTx.deployment)
  }
}

export default func

func.tags = ["TokenDeployer"]
