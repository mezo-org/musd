import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { setupDeploymentBoilerplate } from "../helpers/deploy-helpers"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy, getValidDeployment, isHardhatNetwork, log } =
    await setupDeploymentBoilerplate(hre)

  const TBTC = await getValidDeployment("TBTC")
  if (TBTC) {
    log(`Using TBTC at ${TBTC.address}`)
    return
  }

  // TBTC should exist for all networks but local "hardhat" network
  // used for development and tests.
  if (isHardhatNetwork) {
    await deploy("TBTC", {
      contract: "MockERC20",
      args: ["TBTC", "TBTC", ethers.parseEther("100")],
    })
  } else {
    throw new Error("unable to resolve TBTC; check /external")
  }
}

export default func

func.tags = ["ResolveTbtcToken"]
