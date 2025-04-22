// scripts/deployment-helpers.ts
import * as fs from "fs"
import * as path from "path"
import { ethers } from "hardhat"

/**
 * Get the deployment address for a contract
 */
async function getDeploymentAddress(contractName: string): Promise<string> {
  // Get the network name
  const network = await ethers.provider.getNetwork()
  const networkName = network.name === "unknown" ? "hardhat" : network.name

  console.log(networkName)

  // Path to deployment file
  const deploymentDir = path.join(__dirname, "..", "deployments", networkName)
  const deploymentFile = path.join(deploymentDir, `${contractName}.json`)

  console.log(deploymentFile)

  if (!fs.existsSync(deploymentFile)) {
    throw new Error(
      `Deployment file not found for ${contractName} on network ${networkName}`,
    )
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"))
  return deployment.address
}

export default getDeploymentAddress
