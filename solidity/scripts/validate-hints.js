const { ethers } = require("ethers")

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545")

  const {
    abi: SortedTrovesABI,
    address: SortedTrovesAddress,
  } = require("../deployments/matsnet/SortedTroves.json")

  const sortedTrovesContract = new ethers.Contract(
    SortedTrovesAddress,
    SortedTrovesABI,
    provider,
  )

  try {
    // Asset amount: 239989287850000, Composite debt: 3659210000000000000000, NICR: 6558500000000
    // Note you will need to calculate the NICR from the composite debt and asset amount
    const isValid = await sortedTrovesContract.validInsertPosition(
      6558500000000n,
      "0x3ec5855bd5dd17ef968b8b9fe43cd7548ff53421",
      "0x2136cA89575D19eFF71010B5Ce098D8d773f1cb4",
    )
    console.log("Hints are valid:", isValid)
  } catch (error) {
    console.error("Error calling contract function:", error)
  }
}

main()
