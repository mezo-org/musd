import { deployments, ethers, helpers } from "hardhat"
import { DeployOptions } from "hardhat-deploy/types"
import type { BaseContract } from "ethers"
import * as fs from "fs"

import { EchidnaTest } from "../typechain"

/*
This file is used to debug the echidna invariant testing found in
`EchidnaTest.sol`. Whenever a codepath isn't doing what we expect, or to verify
a broken invariant, we can paste the given sequence below, in the body of
`main`.

To run, invoke `npx hardhat run scripts/debug-echidna.ts`
*/

async function getDeployedContract<T extends BaseContract>(
  deploymentName: string,
): Promise<T> {
  const { address, abi } = await deployments.get(deploymentName)
  // Use default unnamed signer from index 0 to initialize the contract runner.

  const { getUnnamedSigners } = helpers.signers
  const [defaultSigner] = await getUnnamedSigners()
  return new ethers.BaseContract(address, abi, defaultSigner) as T
}

async function deploy(name: string) {
  const { deployer } = await helpers.signers.getNamedSigners()

  const defaultDeployOptions: DeployOptions = {
    from: deployer.address,
    log: false,
    waitConfirmations: 1,
    gasLimit: 5000000000,
    value: "0xffffffffffffffffffffffff",
  }

  return deployments.deploy(name, defaultDeployOptions)
}

async function main() {
  fs.rmSync("./deployments/hardhat", { recursive: true, force: true })

  await deploy("EchidnaTest")
  const e: EchidnaTest = await getDeployedContract("EchidnaTest")

  await e.payDebtExt()
  await e.payDebtExt()
  await e.setPriceExt(0)
  await e.liquidateExt(
    43093724108198014017605941667590544986780162n,
    739999144148240526457498301358303937927126984106732904420385826191n,
  )
  await e.setPriceExt(37964111267508330424779n)
  await e.refinanceExt(
    76609358920546818668946999372476761706292127312159036359400n,
  )

  console.log(await e.echidna_sum_of_debt())

  fs.rmSync("./deployments/hardhat", { recursive: true, force: true })
}

;(async () => {
  await main()
})()
