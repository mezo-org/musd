import { HardhatRuntimeEnvironment } from "hardhat/types"
import { Deployment, DeployOptions } from "hardhat-deploy/types"

function waitConfirmationsNumber(networkName: string): number {
  switch (networkName) {
    case "sepolia":
      return 6
    default:
      return 1
  }
}

export default async function waitForTransaction(
  hre: HardhatRuntimeEnvironment,
  txHash: string,
  confirmations: number = 1,
) {
  if (hre.network.name === "hardhat") {
    return
  }

  const { provider } = hre.ethers
  const transaction = await provider.getTransaction(txHash)

  if (!transaction) {
    throw new Error(`Transaction ${txHash} not found`)
  }

  let currentConfirmations = await transaction.confirmations()
  while (currentConfirmations < confirmations) {
    // wait 1s between each check to save API compute units
    // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
    await new Promise((resolve) => setTimeout(resolve, 1000))
    // eslint-disable-next-line no-await-in-loop
    currentConfirmations = await transaction.confirmations()
  }
}

type PartialDeployOptions = Omit<DeployOptions, "from"> & { from?: string }

export async function setupDeploymentBoilerplate(
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts, helpers, network } = hre
  const { log } = deployments
  const { deployer } = await getNamedAccounts()

  const getValidDeployment = async (
    contractName: string,
  ): Promise<Deployment | null> => {
    const contract = await deployments.getOrNull(contractName)
    if (contract && helpers.address.isValid(contract.address)) {
      return contract
    }
    return null
  }

  const defaultDeployOptions: DeployOptions = {
    from: deployer,
    log: true,
    waitConfirmations: waitConfirmationsNumber(network.name),
  }

  const deploy = (name: string, options: PartialDeployOptions) => {
    log(`Deploying ${name} contract...`)
    return deployments.deploy(name, { ...defaultDeployOptions, ...options })
  }

  const getOrDeploy = async (
    contractName: string,
    options: PartialDeployOptions = {},
  ) => {
    const deployment = await getValidDeployment(contractName)
    if (deployment) {
      log(`Using ${contractName} at ${deployment.address}`)
    } else {
      await deploy(contractName, {
        contract: contractName,
        args: [],
        ...options,
      })
    }
  }

  return {
    deploy,
    deployer,
    deployments,
    getOrDeploy,
    getValidDeployment,
    isHardhatNetwork: network.name === "hardhat",
    log,
    network,
  }
}
