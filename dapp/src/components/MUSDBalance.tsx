import React from "react"

import { useMUSDBalance } from "../hooks/useMUSDBalance"
import { useWalletInfo } from "../hooks/useWalletInfo"

export const MUSDBalance: React.FC = () => {
  const { isConnected, matsnet } = useWalletInfo()
  const { formatted, isLoading, refetch } = useMUSDBalance()

  if (!isConnected) {
    return null
  }

  return (
    <div className="musd-balance">
      <h3>MUSD Balance</h3>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <>
          <p className="balance">{formatted} MUSD</p>
          <p className="address">
            Smart Account: {matsnet.address?.slice(0, 6)}...
            {matsnet.address?.slice(-4)}
          </p>
          <button onClick={() => refetch()}>Refresh</button>
        </>
      )}
    </div>
  )
}
