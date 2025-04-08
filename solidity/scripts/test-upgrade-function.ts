import { ethers } from "hardhat"

async function main() {
  // Connect to the proxy contract
  const proxyAddress = "0x25D5267a70Ee9a4801BcBDBABe513034926a8559" // Your proxy address

  console.log("Testing if upgrade was successful...")

  // Load the contract with the new ABI that includes our test function
  const contract = await ethers.getContractAt(
    "TestInterestRateManager",
    proxyAddress,
  )

  // Check if our new function exists by trying to call it
  try {
    console.log(
      "Testing setInterestRateForTesting with 400 basis points (4%)...",
    )
    const tx = await contract.setInterestRateForTesting(400)
    await tx.wait()

    console.log(
      "Function called successfully! The contract was upgraded correctly.",
    )

    // Check the new rate
    const rate = await contract.interestRate()
    console.log(
      `Current interest rate: ${rate} basis points (${Number(rate) / 100}%)`,
    )
  } catch (error) {
    console.error(
      "Function call failed. The contract may not be upgraded correctly:",
    )
    console.error(error)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script error:", error)
    process.exit(1)
  })
