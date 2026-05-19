import React, { useState } from "react"

import { OnrampWidget } from "./OnrampWidget"
import { useOnramp } from "../hooks/useOnramp"
import { useWalletInfo } from "../hooks/useWalletInfo"

interface BuyMUSDButtonProps {
  amount?: string
  onSuccess?: () => void
}

export const BuyMUSDButton: React.FC<BuyMUSDButtonProps> = ({
  amount,
  onSuccess,
}) => {
  const [showWidget, setShowWidget] = useState(false)
  const [quote, setQuote] = useState<any>(null)
  const { getQuote, loading } = useOnramp()
  const { isConnected, matsnet } = useWalletInfo()

  const handleClick = async () => {
    if (amount) {
      // Fetch quote before showing widget
      const quoteData = await getQuote({
        sourceAmount: amount,
        sourceCurrency: 'usd',
        destinationCurrency: 'musd',
      });
      setQuote(quoteData);
    }
    setShowWidget(true);
  };

  const handleSuccess = (session: any) => {
    console.log('Onramp completed:', session);
    setShowWidget(false);
    onSuccess?.();
  };

  const handleError = (error: Error) => {
    console.error('Onramp error:', error);
    alert(`Error: ${error.message}`);
  };

  if (showWidget) {
    return (
      <div className="onramp-modal">
        <div className="onramp-modal-content">
          <button
            className="onramp-modal-close"
            onClick={() => setShowWidget(false)}
          >
            ×
          </button>
          
          {quote && (
            <div className="onramp-quote">
              <h3>Purchase Summary</h3>
              <div className="quote-details">
                <div className="quote-row">
                  <span>Amount:</span>
                  <span>${amount} USD</span>
                </div>
                <div className="quote-row">
                  <span>Transaction Fee:</span>
                  <span>${quote.fees.transactionFee}</span>
                </div>
                <div className="quote-row">
                  <span>Network Fee:</span>
                  <span>${quote.fees.networkFee}</span>
                </div>
                <div className="quote-row total">
                  <span>You'll receive:</span>
                  <span>{quote.destinationAmount} MUSD</span>
                </div>
              </div>
            </div>
          )}

          <OnrampWidget
            sourceAmount={amount}
            sourceCurrency="usd"
            onSuccess={handleSuccess}
            onError={handleError}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      className="buy-musd-button"
      onClick={handleClick}
      disabled={loading || !isConnected}
    >
      {loading
        ? "Loading..."
        : isConnected
          ? "Buy MUSD with Card"
          : "Connect Wallet First"}
    </button>
  );
};
