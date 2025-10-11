import { HardhatRuntimeEnvironment } from "hardhat/types"
import { Deployment, DeployOptions } from "hardhat-deploy/types"
import { UpgradesDeployOptions } from "@keep-network/hardhat-helpers/src/upgrades"
import { artifacts, deployments, ethers, helpers } from "hardhat"
import type { BaseContract } from "ethers"
import {
  ActivePool,
  BorrowerOperations,
  BorrowerOperationsSignatures,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  GovernableVariables,
  HintHelpers,
  InterestRateManager,
  MockAggregator,
  PCV,
  PriceFeed,
  ReversibleCallOptionManager,
  SortedTroves,
  StabilityPool,
  TroveManager,
  TroveManagerTester,
} from "../typechain"

export function waitConfirmationsNumber(networkName: string): number {
  switch (networkName) {
    case "mainnet":
      return 6
    case "matsnet":
      return 6
    default:
      return 1
  }
}

type ExternalAddresses = {
  [networkName: string]: {
    PriceOracleCaller: string
  }
}

export const EXTERNAL_ADDRESSES: ExternalAddresses = {
  matsnet: {
    PriceOracleCaller: "0x7b7c000000000000000000000000000000000015",
  },
  mainnet: {
    PriceOracleCaller: "0x7b7c000000000000000000000000000000000015",
  },
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

export async function fetchAllDeployedContracts(
  isHardhatNetwork: boolean,
  isFuzzTestingNetwork: boolean,
) {
  const activePool: ActivePool = await getDeployedContract("ActivePool")

  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")

  const borrowerOperationsSignatures: BorrowerOperationsSignatures =
    await getDeployedContract("BorrowerOperationsSignatures")

  const collSurplusPool: CollSurplusPool =
    await getDeployedContract("CollSurplusPool")

  const defaultPool: DefaultPool = await getDeployedContract("DefaultPool")
  const gasPool: GasPool = await getDeployedContract("GasPool")
  const governableVariables: GovernableVariables = await getDeployedContract(
    "GovernableVariables",
  )
  const hintHelpers: HintHelpers = await getDeployedContract("HintHelpers")

  const interestRateManager: InterestRateManager = await getDeployedContract(
    isFuzzTestingNetwork ? "InterestRateManagerTester" : "InterestRateManager",
  )

  // TODO: replace with a real aggregator
  const mockAggregator: MockAggregator =
    await getDeployedContract("MockAggregator")

  const musd = isHardhatNetwork
    ? await getDeployedContract("MUSDTester")
    : await getDeployedContract("MUSD")

  const pcv: PCV = await getDeployedContract("PCV")
  const priceFeed: PriceFeed = await getDeployedContract("PriceFeed")
  
  const reversibleCallOptionManager: ReversibleCallOptionManager = 
    await getDeployedContract("ReversibleCallOptionManager")
  
  const sortedTroves: SortedTroves = await getDeployedContract("SortedTroves")

  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")

  const troveManager: TroveManager | TroveManagerTester =
    await getDeployedContract(
      isHardhatNetwork ? "TroveManagerTester" : "TroveManager",
    )

  return {
    activePool,
    borrowerOperations,
    borrowerOperationsSignatures,
    collSurplusPool,
    defaultPool,
    gasPool,
    governableVariables,
    hintHelpers,
    interestRateManager,
    mockAggregator,
    musd,
    pcv,
    priceFeed,
    reversibleCallOptionManager,
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

  const defaultProxyDeployOptions: UpgradesDeployOptions = {
    factoryOpts: { signer: deployer },
    initializerArgs: [],
    proxyOpts: {
      kind: "transparent",
      initialOwner: deployer.address,
      unsafeAllow: ["external-library-linking"],
    },
  }

  const deployProxy = (name: string, options: UpgradesDeployOptions = {}) => {
    log(`Deploying ${name} contract...`)
    return helpers.upgrades.deployProxy(name, {
      ...defaultProxyDeployOptions,
      ...options,
    })
  }

  const getOrDeploy = async (
    contractName: string,
    options: PartialDeployOptions = {},
  ): Promise<Deployment> => {
    const deployment = await getValidDeployment(contractName)
    if (deployment) {
      log(`Using ${contractName} at ${deployment.address}`)
      return deployment
    }

    const contract = await deploy(contractName, {
      contract: contractName,
      args: [],
      ...options,
    })

    if (network.name !== "hardhat" && false) {  // Temporarily disabled verification
      await helpers.etherscan.verify(contract)
    }
    return contract
  }

  const getOrDeployProxy = async (
    contractName: string,
    options: UpgradesDeployOptions = {},
  ) => {
    const deployment = await getValidDeployment(contractName)
    if (deployment) {
      log(`Using ${contractName} at ${deployment.address}`)
      return deployment
    }

    const [_, contract] = await deployProxy(contractName, options)

    if (network.name !== "hardhat" && false) {  // Temporarily disabled verification
      await helpers.etherscan.verify(contract)
    }
    return contract
  }

  const execute = (
    contractName: string,
    functionName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) =>
    hre.deployments.execute(
      contractName,
      {
        from: deployer.address,
        log: true,
        waitConfirmations: waitConfirmationsNumber(network.name),
        gasLimit: 3000000,
      },
      functionName,
      ...args,
    )

  return {
    deploy,
    deployProxy,
    deployer,
    deployments,
    execute,
    getOrDeploy,
    getOrDeployProxy,
    getValidDeployment,
    isHardhatNetwork: network.name === "hardhat",
    isFuzzTestingNetwork: network.name === "matsnet_fuzz",
    log,
    network,
  }
}

/**
 * Saves the deployment artifact of a deployed contract.
 * @param {string} deploymentName - The name of the deployment.
 * @param {string} contractAddress - The deployed contract's address.
 * @param {string} transactionHash - The hash of the transaction used to deploy the contract.
 * @param {Object} [opts] - Additional options for the deployment artifact.
 * @param {string} [opts.contractName] - The name of the contract, used to retrieve the artifact.
 * Defaults to the deployment name if not specified.
 * @param {unknown[]} [opts.constructorArgs] - The arguments passed to the contract's
 * constructor.
 * @param {string} [opts.implementation] - The address of the contract's implementation,
 * for proxy-based deployments.
 * @param {boolean} [opts.log] - If true, logs the details of the saved deployment
 * artifact.
 * @returns {Promise<Deployment>} Details of the deployment.

 */
export async function saveDeploymentArtifact(
  deploymentName: string,
  contractAddress: string,
  transactionHash: string,
  opts?: {
    contractName?: string
    constructorArgs?: unknown[]
    implementation?: string
    log?: boolean
  },
): Promise<Deployment> {
  const artifact = await artifacts.readArtifact(
    opts?.contractName || deploymentName,
  )

  const deployment: Deployment = {
    address: contractAddress,
    abi: artifact.abi,
    transactionHash,
    args: opts?.constructorArgs,
    implementation: opts?.implementation,
  }

  await deployments.save(deploymentName, deployment)

  if (opts?.log) {
    deployments.log(
      `Saved deployment artifact for '${deploymentName}' with address ${contractAddress}` +
        ` and deployment transaction: ${transactionHash}`,
    )
  }

  return deployment
}
