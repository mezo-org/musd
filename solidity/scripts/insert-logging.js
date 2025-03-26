const { ethers } = require("ethers")

// 'Asset amount: 239989287850000, Composite debt: 3659210000000000000000, NICR: 6558500000000

async function main() {
  // Connect to the local JSON-RPC node
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545")

  const privateKey =
    "0x60ddFE7f579aB6867cbE7A2Dc03853dC141d7A4aB6DBEFc0Dae2d2B1Bd4e487F"
  const wallet = new ethers.Wallet(privateKey)

  // Connect a wallet to mainnet
  const walletWithProvider = new ethers.Wallet(privateKey, provider)

  // Minimal ABI for the function to call
  const {
    abi: TroveManagerABI,
    address: TroveManagerAddress,
  } = require("../deployments/matsnet/TroveManager.json")

  const {
    abi: SortedTrovesABI,
    address: SortedTrovesAddress,
  } = require("../deployments/localhost/SortedTroves.json")

  const {
    abi: NewBOABI,
    address: NewBOAddress,
  } = require("../deployments/localhost/BorrowerOperations.json")

  // Create a contract instance
  const troveManagerContract = new ethers.Contract(
    TroveManagerAddress,
    TroveManagerABI,
    provider,
  )

  const sortedTrovesContract = new ethers.Contract(
    SortedTrovesAddress,
    SortedTrovesABI,
    provider,
  )

  const newBOContract = new ethers.Contract(NewBOAddress, NewBOABI, provider)

  try {
    const insertTx = await sortedTrovesContract
      .connect(walletWithProvider)
      .insert(
        "0xfce90FFA5F7431CAD6a2eE4D601364127a3A8Eb7",
        6558500000000n,
        "0x3ec5855bd5dd17ef968b8b9fe43cd7548ff53421",
        "0x2136cA89575D19eFF71010B5Ce098D8d773f1cb4",
      )
    console.log("Trove Inserted")
  } catch (error) {
    console.error("Error calling contract function:", error)
  }
}

main()
