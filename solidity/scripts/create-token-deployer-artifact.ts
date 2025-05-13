import { HardhatRuntimeEnvironment } from "hardhat/types"
import { saveDeploymentArtifact } from "../helpers/deploy-helpers"

async function main(hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre
  const { log } = deployments

  // The deterministic address of TokenDeployer on testnet
  const tokenDeployerAddress = "0x123694886DBf5Ac94DDA07135349534536D14cAf"

  log("Creating deployment artifact for existing TokenDeployer...")

  const deployment = await saveDeploymentArtifact(
    "TokenDeployer",
    tokenDeployerAddress,
    "0x0000000000000000000000000000000000000000000000000000000000000000", // Placeholder tx hash
    {
      contractName: "contracts/token/TokenDeployer.sol:TokenDeployer",
      log: true,
    }
  )

  log(`Created deployment artifact for TokenDeployer at ${deployment.address}`)
}

main(require("hardhat").hre)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  }) 