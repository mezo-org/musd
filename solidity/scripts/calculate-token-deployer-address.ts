import { ethers } from "hardhat"
import { singletonFactoryAddress } from "../helpers/erc2470/singleton-factory"

async function main() {
  console.log("Singleton Factory Address:", singletonFactoryAddress)

  // Get the TokenDeployer bytecode
  const TokenDeployer = await ethers.getContractFactory("TokenDeployer")
  const bytecode = TokenDeployer.bytecode

  // Calculate the salt
  const salt = ethers.keccak256(
    ethers.toUtf8Bytes("Bank on yourself. Bring everyday finance to your Bitcoin.")
  )

  // Calculate the deterministic address
  const initCode = bytecode
  const deterministicAddress = ethers.getCreate2Address(
    singletonFactoryAddress,
    salt,
    ethers.keccak256(initCode)
  )

  console.log("TokenDeployer Deterministic Address:", deterministicAddress)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  }) 