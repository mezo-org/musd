import { useSendTransaction } from "@mezo-org/passport"
import { encodeFunctionData, parseUnits } from "viem"

const MUSD_TOKEN_ADDRESS = import.meta.env
  .VITE_MUSD_TOKEN_ADDRESS as `0x${string}`

const ERC20_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

/**
 * Send MUSD tokens
 * User signs with Bitcoin wallet, smart account executes transaction
 */
export const useSendMUSD = () => {
  const { sendTransaction } = useSendTransaction()

  const sendMUSD = async (to: string, amount: string) => {
    if (!to || !amount) {
      throw new Error("Recipient address and amount are required")
    }

    if (!MUSD_TOKEN_ADDRESS) {
      throw new Error("MUSD token address not configured")
    }

    // Encode the transfer function call
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to as `0x${string}`, parseUnits(amount, 18)],
    })

    // Send transaction with 3 arguments (to, value, data)
    // User will sign with their Bitcoin wallet
    // Smart account will execute the transaction
    const hash = await sendTransaction(MUSD_TOKEN_ADDRESS, 0n, data)

    return hash
  }

  return {
    sendMUSD,
  }
}
