import { ethers } from "hardhat"
import getContracts from "./get-contracts"

async function main() {
  const { mockAggregator } = await getContracts()

  // 20 million with 18 decimals
  const newPrice = ethers.parseUnits("20000000", 18)

  const tx = await mockAggregator.setPrice(newPrice)
  await tx.wait()

  console.log("Price set to 20 million")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
