import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  saveDeploymentArtifact,
  setupDeploymentBoilerplate,
} from "../helpers/deploy-helpers"
import { TokenDeployer } from "../typechain"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {
    deployments,
    execute,
    getOrDeploy,
    getValidDeployment,
    log,
    isHardhatNetwork,
    deployer,
  } = await setupDeploymentBoilerplate(hre)
  const { helpers } = hre

  const borrowerOperations = await deployments.get("BorrowerOperations")

  const isFuzzTestingNetwork = hre.network.name === "matsnet_fuzz"

  const interestRateManagerName = isFuzzTestingNetwork
    ? "InterestRateManagerTester"
    : "InterestRateManager"

  const interestRateManager = await deployments.get(interestRateManagerName)
  const troveManager = await deployments.get(
    isHardhatNetwork ? "TroveManagerTester" : "TroveManager",
  )
  const stabilityPool = await deployments.get("StabilityPool")

  // Short-circuit. On Hardhat, we do not use the real token contract for tests.
  // Instead, the MUSDTester is resolved as MUSD.
  if (isHardhatNetwork) {
    await getOrDeploy("MUSDTester")
    await execute(
      "MUSDTester",
      "initialize",
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address,
      interestRateManager.address,
      10,
    )
    return
  }

  // Short-circuit. If MUSD is already deployed, skip the rest.
  const musd = await getValidDeployment("MUSD")
  if (musd) {
    log(`Using MUSD at ${musd.address}`)
    return
  }

  const eligibleDeployer = "0x123694886DBf5Ac94DDA07135349534536D14cAf"
  if (deployer.address !== eligibleDeployer) {
    log(
      `The deployer is NOT the eligible deployer! The deployer address is ${deployer.address} and should be ${eligibleDeployer}`,
    )
    throw new Error("The deployer is not the eligible deployer")
  }

  log("Deploying the MUSD token contract...")

  const tokenDeployer = (await helpers.contracts.getContract(
    "TokenDeployer",
  )) as unknown as TokenDeployer

  const tx = await tokenDeployer.connect(deployer).deployToken(
    troveManager.address,
    stabilityPool.address,
    borrowerOperations.address,
    interestRateManager.address,
    // TODO: Isn't 90 days too much at the beginning???
    90 * 24 * 60 * 60, // 90 days in seconds
  )

  const tokenDeployment = await saveDeploymentArtifact(
    "MUSD",
    await tokenDeployer.token(),
    tx.hash,
    {
      contractName: "contracts/token/MUSD.sol:MUSD",
      log: true,
    },
  )

  await helpers.etherscan.verify(tokenDeployment)
}

export default func

func.tags = ["MUSD"]
func.dependencies = [
  "BorrowerOperations",
  "InterestRateManager",
  "StabilityPool",
  "TroveManager",
]
