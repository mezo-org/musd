import { ethers } from "hardhat"
import * as fs from "fs"
import * as path from "path"

async function main() {
  // Configuration
  const HINT_HELPERS_ADDRESS = "0x..." // Replace with your HintHelpers address
  const TARGET_CR = ethers.parseUnits("1.5", 18) // 150% CR
  const RANDOM_SEED = 12345 // Any random number

  // Load HintHelpers ABI
  const hintHelpersAbi = [
    "function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)",
  ]

  // Initialize providers
  const providers = [
    "https://rpc.test.mezo.org",
    // Add other RPC endpoints if needed
  ]

  // Function to test a single provider
  async function testProvider(providerUrl: string) {
    console.log(`\nTesting provider: ${providerUrl}`)
    const provider = new ethers.JsonRpcProvider(providerUrl)
    const { hintHelpers } = new ethers.Contract(
      HINT_HELPERS_ADDRESS,
      hintHelpersAbi,
      provider,
    )

    try {
      // Get block gas limit
      const block = await provider.getBlock("latest")
      console.log("Block gas limit:", block.gasLimit.toString())

      // Test different trial counts
      const results = []
      for (let trials = 100; trials <= 1000; trials += 100) {
        try {
          const gasEstimate = await hintHelpers.getApproxHint.estimateGas(
            TARGET_CR,
            trials,
            RANDOM_SEED,
          )
          console.log(`Trials: ${trials}, Gas: ${gasEstimate.toString()}`)
          results.push({ trials, gasEstimate: gasEstimate.toString() })
        } catch (error) {
          console.log(`Trials: ${trials}, Error: ${error.message}`)
          results.push({ trials, error: error.message })
        }
      }

      // Save results to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const filename = `gas-tests-${providerUrl.split("//")[1]}-${timestamp}.json`
      fs.writeFileSync(
        path.join(__dirname, filename),
        JSON.stringify(
          {
            provider: providerUrl,
            blockGasLimit: block.gasLimit.toString(),
            results,
          },
          null,
          2,
        ),
      )

      console.log(`Results saved to ${filename}`)
    } catch (error) {
      console.error("Provider error:", error.message)
    }
  }

  // Run tests for each provider
  for (const providerUrl of providers) {
    await testProvider(providerUrl)
  }
}

main().catch((error) => {
  console.error("Error in main function:", error)
  process.exit(1)
})
