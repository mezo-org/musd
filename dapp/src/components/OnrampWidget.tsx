import React, { useEffect, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { useAccount } from "wagmi"
import { useBitcoinAccount } from "@mezo-org/passport"

interface OnrampWidgetProps {
  onSuccess?: (session: any) => void
  onError?: (error: Error) => void
  destinationAmount?: string
  sourceAmount?: string
  sourceCurrency?: string
}

export const OnrampWidget: React.FC<OnrampWidgetProps> = ({
  onSuccess,
  onError,
  destinationAmount,
  sourceAmount,
  sourceCurrency = "usd",
}) => {
  // Get Matsnet smart account address (where MUSD will be sent)
  const { address: matsnetAddress } = useAccount()

  // Get Bitcoin wallet address (for display)
  const { btcAddress } = useBitcoinAccount()

  const [clientSecret, setClientSecret] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!matsnetAddress) {
      setError("Please connect your wallet first")
      setLoading(false)
      return
    }

    createOnrampSession()
  }, [matsnetAddress, destinationAmount, sourceAmount])

  const createOnrampSession = async () => {
    try {
      setLoading(true);
      setError(undefined);

      // Create onramp session with Matsnet smart account address
      // MUSD will be sent here
      const response = await fetch(
        `${import.meta.env.VITE_PAYMENT_SERVICE_URL}/api/v1/onramp/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: matsnetAddress, // Smart account receives MUSD
            destinationAmount,
            sourceAmount,
            sourceCurrency,
          }),
        },
      )

      if (!response.ok) {
        throw new Error('Failed to create onramp session');
      }

      const data = await response.json();
      setClientSecret(data.data.clientSecret);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clientSecret) return;

    const initializeOnramp = async () => {
      try {
        // Load Stripe SDK
        const stripe = await loadStripe(
          import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
        )

        if (!stripe) {
          throw new Error("Failed to load Stripe")
        }

        // Note: For now, we'll use a simple redirect to Stripe's hosted onramp
        // The embedded crypto element may not be available in all regions
        console.log("Onramp session created with client secret:", clientSecret)

        // You can implement the embedded element here when available
        // For now, we'll show the session info
        const sessionInfo = document.getElementById("onramp-element")
        if (sessionInfo) {
          sessionInfo.innerHTML = `
            <div style="padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
              <h4>Onramp Session Created</h4>
              <p>Bitcoin Wallet: ${btcAddress?.slice(0, 8)}...${btcAddress?.slice(-6)}</p>
              <p>MUSD will be sent to your smart account</p>
              <p>Session ID: ${clientSecret?.slice(0, 20)}...</p>
              <p style="color: #666; font-size: 14px;">Note: Embedded onramp widget will be available when Stripe Crypto supports MUSD</p>
            </div>
          `
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    initializeOnramp();
  }, [clientSecret, onSuccess, onError]);

  if (!matsnetAddress) {
    return (
      <div className="onramp-widget-error">
        <p>Please connect your wallet to buy MUSD</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="onramp-widget-loading">
        <div className="spinner"></div>
        <p>Loading payment options...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="onramp-widget-error">
        <p>Error: {error}</p>
        <button onClick={createOnrampSession}>Retry</button>
      </div>
    )
  }

  return (
    <div className="onramp-widget">
      <div className="wallet-info">
        <p>
          Bitcoin Wallet: {btcAddress?.slice(0, 8)}...
          {btcAddress?.slice(-6)}
        </p>
        <p>MUSD will be sent to your smart account</p>
      </div>
      <div id="onramp-element"></div>
    </div>
  )
}
