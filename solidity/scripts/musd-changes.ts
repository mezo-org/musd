import { deployments } from "hardhat"
import { getDeploymentAddress } from "./deployment-helpers"

async function main() {
  const musdDeployment = await deployments.get("MUSD")
  console.log("MUSD ABI:", musdDeployment.abi)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script error:", error)
    process.exit(1)
  })
