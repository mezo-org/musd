import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, helpers, network } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const TBTC = await deployments.getOrNull("TBTC")

  const isValidDeployment = TBTC && helpers.address.isValid(TBTC.address)

  if (isValidDeployment) {
    log(`Using TBTC at ${TBTC.address}`)
    return
  }

  // TBTC should exist for all networks but local "hardhat" network
  // used for development and tests.
  if (network.name === "hardhat") {
    log("Deploying mock TBTC contract...")
    await deployments.deploy("TBTC", {
      contract: "contracts/v1/tests/MockERC20.sol:MockERC20",
      from: deployer,
      args: ["TBTC", "TBTC", ethers.parseEther("100")],
      log: true,
      waitConfirmations: 1,
    })
  } else {
    throw new Error("unable to resolve TBTC; check /external")
  }
}

export default func

func.tags = ["ResolveTbtcToken"]
