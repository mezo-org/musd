import React from "react"

import { WalletConnect } from "./components/WalletConnect"
import { MUSDBalance } from "./components/MUSDBalance"
import { BuyMUSDButton } from "./components/BuyMUSDButton"
import { useWalletInfo } from "./hooks/useWalletInfo"

import "./App.css"

function App() {
  const { isConnected, bitcoin, matsnet } = useWalletInfo()

  return (
    <div className="App">
      <header className="App-header">
        <h1>MUSD Payment Integration</h1>
        <p>Buy MUSD with your Bitcoin wallet using Stripe</p>
        <WalletConnect />
      </header>

      <main>
        {isConnected ? (
          <>
            <section className="wallet-info">
              <h2>Connected Wallets</h2>
              <div className="wallet-details">
                <div className="wallet-card">
                  <h3>Bitcoin Wallet</h3>
                  <p className="address">{bitcoin.address}</p>
                  <p className="balance">
                    {bitcoin.balanceBTC.toFixed(8)} BTC
                  </p>
                </div>
                <div className="wallet-card">
                  <h3>Matsnet Smart Account</h3>
                  <p className="address">{matsnet.address}</p>
                  <p className="balance">
                    {matsnet.formatted} {matsnet.symbol}
                  </p>
                </div>
              </div>
            </section>

            <section className="musd-section">
              <MUSDBalance />
              <div className="actions">
                <BuyMUSDButton
                  amount="100"
                  onSuccess={() => {
                    console.log("MUSD purchase completed!")
                    // Refresh balance or show success message
                  }}
                />
              </div>
            </section>
          </>
        ) : (
          <section className="connect-prompt">
            <h2>Connect Your Wallet</h2>
            <p>Connect your Bitcoin wallet to get started with MUSD</p>
            <p>Supported wallets: Unisat, OKX, Xverse</p>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
