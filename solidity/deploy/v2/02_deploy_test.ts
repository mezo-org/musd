import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import waitForTransaction from "../../helpers/deploy-helpers.ts"
import { TokenAbility } from "../../types"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, helpers, network, getNamedAccounts } = hre
  const { log } = deployments
  const { deployer } = await helpers.signers.getNamedSigners()
  const { governance } = await getNamedAccounts()

  const deployment = await deployments.getOrNull("Dummy")
  if (deployment && helpers.address.isValid(deployment.address)) {
    log(`Using Dummy at ${deployment.address}`)
  } else {
    log("Deploying Dummy contract...")

    const tbtcAddress = (await deployments.get("TBTC")).address

    const supportedTokens = [
      { token: tbtcAddress, tokenAbility: TokenAbility.DepositAndLock },
    ]

    log("Supported tokens: ", supportedTokens)

    const [_, dummyDeployment] = await helpers.upgrades.deployProxy("Dummy", {
      contractName: "Dummy",
      initializerArgs: [],
      factoryOpts: { signer: deployer },
      proxyOpts: {
        kind: "transparent",
        initialOwner: governance,
      },
    })

    if (dummyDeployment.transactionHash && hre.network.tags.etherscan) {
      const confirmationsByChain: Record<string, number> = {
        mainnet: 6,
        sepolia: 12,
      }
      await waitForTransaction(
        hre,
        dummyDeployment.transactionHash,
        confirmationsByChain[network.name],
      )
      await helpers.etherscan.verify(dummyDeployment)
    }
  }
}

export default func

func.tags = ["Dummy"]
func.dependencies = ["ResolveTbtcToken"]
