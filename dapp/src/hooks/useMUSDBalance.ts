import { useReadContract, useAccount } from "wagmi"
import { formatUnits } from "viem"

const MUSD_TOKEN_ADDRESS = import.meta.env
  .VITE_MUSD_TOKEN_ADDRESS as `0x${string}`

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

/**
 * Get MUSD balance for the connected wallet's smart account
 */
export const useMUSDBalance = () => {
  const { address } = useAccount()

  const { data: balance, isLoading, error, refetch } = useReadContract({
    address: MUSD_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!MUSD_TOKEN_ADDRESS,
    },
  })

  return {
    balance,
    formatted: balance ? formatUnits(balance, 18) : "0",
    isLoading,
    error,
    refetch,
  }
}
