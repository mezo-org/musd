import React from "react"
import { ConnectButton } from "@rainbow-me/rainbowkit"

/**
 * Wallet connection button using RainbowKit
 * Supports both Bitcoin wallets (via Mezo Passport) and EVM wallets
 */
export const WalletConnect: React.FC = () => {
  return <ConnectButton chainStatus="icon" showBalance={true} />
}
