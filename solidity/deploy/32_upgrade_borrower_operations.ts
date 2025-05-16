import type { HardhatRuntimeEnvironment } from "hardhat/types"
import type { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { helpers, deployments } = hre

  const { deployer } = await helpers.signers.getNamedSigners()

  const { newImplementationAddress, preparedTransaction } =
    await helpers.upgrades.prepareProxyUpgrade(
      "BorrowerOperations",
      "BorrowerOperations",
      {
        contractName: "contracts/BorrowerOperations.sol:BorrowerOperations",
      },
    )

  deployments.log(
    `prepared transaction: ${JSON.stringify(preparedTransaction)}`,
  )

  if (["mainnet", "matsnet"].includes(hre.network.name)) {
    return
  }

  deployments.log("Sending transaction to upgrade implementation...")
  await deployer.sendTransaction(preparedTransaction)

  if (hre.network.tags.etherscan) {
    // We use `verify` instead of `verify:verify` as the `verify` task is defined
    // in "@openzeppelin/hardhat-upgrades" to verify the proxy’s implementation
    // contract, the proxy itself and any proxy-related contracts, as well as
    // link the proxy to the implementation contract’s ABI on (Ether)scan.
    await hre.run("verify", {
      address: newImplementationAddress,
    })
  }
}

export default func

func.tags = ["UpgradeBorrowerOperations"]

// Comment this line when running an upgrade.
func.skip = async () => true
