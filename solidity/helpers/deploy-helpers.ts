import { HardhatRuntimeEnvironment } from "hardhat/types"
import { Deployment, DeployOptions } from "hardhat-deploy/types"
import { deployments, ethers, helpers } from "hardhat"
import type { BaseContract } from "ethers"
import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  HintHelpers,
  InterestRateManager,
  MockAggregator,
  PCV,
  PriceFeed,
  SortedTroves,
  StabilityPool,
  TroveManager,
  TroveManagerTester,
} from "../typechain"

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

const { getUnnamedSigners } = helpers.signers

/**
 * Get instance of a contract from Hardhat Deployments.
 * @param deploymentName Name of the contract deployment.
 * @returns Deployed Ethers contract instance.
 */
// eslint-disable-next-line import/prefer-default-export
export async function getDeployedContract<T extends BaseContract>(
  deploymentName: string,
): Promise<T> {
  const { address, abi } = await deployments.get(deploymentName)
  // Use default unnamed signer from index 0 to initialize the contract runner.
  const [defaultSigner] = await getUnnamedSigners()
  return new ethers.BaseContract(address, abi, defaultSigner) as T
}

export async function fetchAllDeployedContracts(isHardhatNetwork: boolean) {
  const activePool: ActivePool = await getDeployedContract("ActivePool")

  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")

  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")

  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")
  const hintHelpers: HintHelpers = await getDeployedContract("HintHelpers")

  const interestRateManager: InterestRateManager = await getDeployedContract(
    "InterestRateManager",
  )

  // TODO: replace with a real aggregator
  const mockAggregator: MockAggregator =
    await getDeployedContract("MockAggregator")

  const musd = isHardhatNetwork
    ? await getDeployedContract("MUSDTester")
    : await getDeployedContract("MUSD")

  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")

  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")

  const troveManager: TroveManager | TroveManagerTester = isHardhatNetwork
    ? await getDeployedContract("TroveManagerTester")
    : await getDeployedContract("TroveManager")

  return {
    activePool,
    borrowerOperations,
    collSurplusPool,
    defaultPool,
    gasPool,
    hintHelpers,
    interestRateManager,
    mockAggregator,
    musd,
    pcv,
    priceFeed,
    sortedTroves,
    stabilityPool,
    troveManager,
  }
}

export async function setupDeploymentBoilerplate(
  hre: HardhatRuntimeEnvironment,
) {
  const { network } = hre
  const { log } = deployments
  const { deployer } = await helpers.signers.getNamedSigners()

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
    from: deployer.address,
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
