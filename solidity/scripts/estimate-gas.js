const { ethers } = require("ethers")

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545")

  const privateKey =
    "0x60ddFE7f579aB6867cbE7A2Dc03853dC141d7A4aB6DBEFc0Dae2d2B1Bd4e487F"
  const walletWithProvider = new ethers.Wallet(privateKey, provider)

  const {
    abi: BorrowerOperationsABI,
    address: BorrowerOperationsAddress,
  } = require("../deployments/matsnet/BorrowerOperations.json")

  const borrowerOperationsContract = new ethers.Contract(
    BorrowerOperationsAddress,
    BorrowerOperationsABI,
    provider,
  )

  try {
    const gasEstimate = await borrowerOperationsContract
      .connect(walletWithProvider)
      .openTrove.estimateGas(
        1000000000000000000n,
        3442000000000000000000n,
        239989287850000n,
        "0x3ec5855bd5dd17ef968b8b9fe43cd7548ff53421",
        "0x2136cA89575D19eFF71010B5Ce098D8d773f1cb4",
        { value: 239989287850000n },
      )
    console.log("Gas estimate: ", gasEstimate.toString())
  } catch (error) {
    console.error("Error calling contract function:", error)
  }
}

main()
