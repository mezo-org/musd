import { useState, useCallback } from 'react';

interface OnrampSession {
  clientSecret: string;
  sessionId: string;
  url: string;
}

interface OnrampQuote {
  destinationAmount: string;
  exchangeRate: string;
  fees: {
    networkFee: string;
    transactionFee: string;
    totalFee: string;
  };
}

export const useOnramp = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const createSession = useCallback(
    async (params: {
      walletAddress: string;
      destinationAmount?: string;
      sourceAmount?: string;
      sourceCurrency?: string;
    }): Promise<OnrampSession | null> => {
      try {
        setLoading(true);
        setError(undefined);

        const response = await fetch(
          `${import.meta.env.VITE_PAYMENT_SERVICE_URL}/api/v1/onramp/sessions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to create onramp session');
        }

        const data = await response.json();
        return data.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getSession = useCallback(
    async (sessionId: string): Promise<any | null> => {
      try {
        setLoading(true);
        setError(undefined);

        const response = await fetch(
          `${import.meta.env.VITE_PAYMENT_SERVICE_URL}/api/v1/onramp/sessions/${sessionId}`
        );

        if (!response.ok) {
          throw new Error('Failed to get onramp session');
        }

        const data = await response.json();
        return data.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getQuote = useCallback(
    async (params: {
      sourceAmount: string;
      sourceCurrency?: string;
      destinationCurrency?: string;
    }): Promise<OnrampQuote | null> => {
      try {
        setLoading(true);
        setError(undefined);

        const queryParams = new URLSearchParams({
          sourceAmount: params.sourceAmount,
          sourceCurrency: params.sourceCurrency || 'usd',
          destinationCurrency: params.destinationCurrency || 'musd',
        });

        const response = await fetch(
          `${import.meta.env.VITE_PAYMENT_SERVICE_URL}/api/v1/onramp/quotes?${queryParams}`
        );

        if (!response.ok) {
          throw new Error('Failed to get quote');
        }

        const data = await response.json();
        return data.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    createSession,
    getSession,
    getQuote,
    loading,
    error,
  };
};
