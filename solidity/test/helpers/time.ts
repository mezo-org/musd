import { ethers } from "hardhat"

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
