import { useBitcoinAccount } from "@mezo-org/passport"
import { useAccount, useBalance } from "wagmi"

/**
 * Get information about connected wallets
 * Returns both Bitcoin wallet info and Matsnet smart account info
 */
export const useWalletInfo = () => {
  // Bitcoin wallet info (original wallet)
  const { btcAddress, btcBalance } = useBitcoinAccount()

  // Matsnet smart account info (backing account)
  const { address: matsnetAddress, isConnected, connector } = useAccount()

  const { data: matsnetBalance } = useBalance({
    address: matsnetAddress,
  })

  return {
    isConnected,
    connector: connector?.name,
    bitcoin: {
      address: btcAddress,
      balance: btcBalance, // in satoshis
      balanceBTC: btcBalance ? Number(btcBalance) / 100000000 : 0,
    },
    matsnet: {
      address: matsnetAddress,
      balance: matsnetBalance?.value,
      formatted: matsnetBalance?.formatted,
      symbol: matsnetBalance?.symbol,
    },
  }
}
