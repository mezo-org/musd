import { ethers } from "hardhat"
import { singletonFactoryAddress } from "../solidity/helpers/erc2470/singleton-factory"

async function main() {
  // Get the contract factory
  const TokenDeployer = await ethers.getContractFactory("TokenDeployer")
  
  // Get the creation code (bytecode)
  const creationCode = TokenDeployer.bytecode
  
  // Calculate the salt (same as in the contract)
  const salt = ethers.keccak256(
    ethers.toUtf8Bytes("Bank on yourself. Bring everyday finance to your Bitcoin.")
  )

  // Calculate the deterministic address
  // The formula for CREATE2 address is:
  // keccak256(0xff ++ deployer ++ salt ++ keccak256(init_code))[12:]
  const initCodeHash = ethers.keccak256(creationCode)
  const address = ethers.getCreateAddress({
    from: singletonFactoryAddress,
    nonce: ethers.keccak256(
      ethers.concat([
        "0xff",
        singletonFactoryAddress,
        salt,
        initCodeHash
      ])
    )
  })

  console.log("TokenDeployer deterministic address:", address)
  console.log("Salt used:", salt)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  }) 