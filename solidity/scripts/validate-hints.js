// validate-hints.js
const { ethers } = require("hardhat")

const { BigNumber } = ethers

// Your transaction hash
const TX_HASH =
  "0x9ac46677981a70567fed06de1df97153209993c873f6e2f34c97147e053a78fd" // Replace with your transaction hash
const BLOCK_NUMBER = 3333547 // Replace with block number before your tx

async function main() {
  // Fork from the block before your transaction
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: "https://rpc.test.mezo.org",
          blockNumber: BLOCK_NUMBER,
        },
      },
    ],
  })

  console.log("Forked blockchain at block", BLOCK_NUMBER)

  // Add to the main function
  const tx = await ethers.provider.getTransaction(TX_HASH)
  console.log("Transaction found:", tx.hash)

  // Get contract interfaces
  const borrowerOperationsABI =
    require("../artifacts/contracts/BorrowerOperations.sol/BorrowerOperations.json").abi
  const borrowerOpsInterface = new ethers.Interface(borrowerOperationsABI)

  // Decode the transaction input
  let decodedInput
  try {
    decodedInput = borrowerOpsInterface.parseTransaction({ data: tx.data })
    console.log("Decoded function:", decodedInput.name)
    console.log("Function arguments:", decodedInput.args)
  } catch (e) {
    console.log(
      "Failed to decode with BorrowerOperations ABI, trying TroveManager...",
    )
    const troveManagerABI =
      require("../artifacts/contracts/TroveManager.sol/TroveManager.json").abi
    const troveManagerInterface = new ethers.Interface(troveManagerABI)
    decodedInput = troveManagerInterface.parseTransaction({ data: tx.data })
    console.log("Decoded function:", decodedInput.name)
    console.log("Function arguments:", decodedInput.args)
  }

  // Extract the hints
  // The exact argument indices depend on which function was called
  // For openTrove, it's typically args[2] and args[3]
  // For redeemCollateral, it might be different
  const upperHint = decodedInput.args[3] // Adjust index as needed
  const lowerHint = decodedInput.args[4] // Adjust index as needed

  console.log("Upper hint:", upperHint)
  console.log("Lower hint:", lowerHint)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
