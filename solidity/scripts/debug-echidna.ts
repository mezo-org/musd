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

  await deploy("Test")
  const e: EchidnaTest = await getDeployedContract("Test")

  await e.openTroveSafeExt(
    1n,
    223478111365515423146270160733109607639557547638n,
    1897713471227427268030450876316543086270n,
  )
  await e.withdrawFromStabilityPoolExt(100373600501007488180017485n)
  await e.setPriceExt(3408210373507613n)
  await e.openTroveSafeExt(
    3n,
    0n,
    31227190436216627548675938150669192438394419243727846152862511911515059n,
  )
  await e.liquidateExt(2n, 1n)

  fs.rmSync("./deployments/hardhat", { recursive: true, force: true })
}

main().catch(() => {
  // console.error(_error)
  process.exitCode = 1
})
