import React from "react"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RainbowKitProvider } from "@rainbow-me/rainbowkit"

import { config } from "../config/mezoPassport"

// Import RainbowKit styles
import "@rainbow-me/rainbowkit/styles.css"

const queryClient = new QueryClient()

interface Web3ProviderProps {
  children: React.ReactNode
}

export const Web3Provider: React.FC<Web3ProviderProps> = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
