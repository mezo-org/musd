import { getConfig } from "@mezo-org/passport"

// Get WalletConnect project ID from environment
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ""

if (!projectId) {
  console.warn(
    "WalletConnect Project ID not found. Get one at https://cloud.walletconnect.com/",
  )
}

export const config = getConfig({
  appName: "MUSD - Mezo USD Payment Integration",
  walletConnectProjectId: projectId,
  mezoNetwork: "testnet", // or "mainnet"
  // Bitcoin wallets are included by default (Unisat, OKX, Xverse)
})
