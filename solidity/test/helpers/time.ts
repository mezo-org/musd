import { ethers } from "hardhat"

// https://sibenotes.com/maths/how-many-seconds-are-in-a-year/
// 365.2425 days per year * 24 hours per day *
// 60 minutes per hour * 60 seconds per minute
export const SECONDS_IN_ONE_YEAR = 31_556_952n

export async function getLatestBlockTimestamp() {
  const { provider } = ethers
  const latestBlock = await provider.getBlock("latest")

  if (latestBlock) {
    return latestBlock.timestamp
  }
  // console.error("Failed to fetch latest block")
  return 0n
}

export async function fastForwardTime(seconds: number): Promise<void> {
  const { provider } = ethers
  await provider.send("evm_increaseTime", [seconds])
  await provider.send("evm_mine", [])
}
