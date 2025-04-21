// scripts/scale-testing/batch-transactions.ts

export interface BatchTransactionOptions {
  testId: string
  batchSize: number
  verbose?: boolean
}

export interface TransactionResult {
  success: boolean
  hash?: string
  account: string
  gasUsed?: bigint
  duration?: number
  error?: string
  [key: string]: string | number | boolean | bigint | undefined // Additional custom properties
}

export interface BatchResults {
  successful: number
  failed: number
  skipped: number
  gasUsed: bigint
  transactions: TransactionResult[]
}

/**
 * Process a batch of transactions with controlled concurrency
 * @param accounts Array of account objects to process
 * @param processAccountFn Async function that processes a single account
 * @param options Batch processing options
 * @returns BatchResults object with transaction results
 */
export async function processBatchTransactions<T>(
  accounts: T[],
  processAccountFn: (account: T, index: number) => Promise<TransactionResult>,
  options: BatchTransactionOptions,
): Promise<BatchResults> {
  const { batchSize, verbose = true } = options

  // Initialize results
  const results: BatchResults = {
    successful: 0,
    failed: 0,
    skipped: 0,
    gasUsed: 0n,
    transactions: [],
  }

  // Process accounts in batches
  for (
    let batchStart = 0;
    batchStart < accounts.length;
    batchStart += batchSize
  ) {
    const batchEnd = Math.min(batchStart + batchSize, accounts.length)

    if (verbose) {
      console.log(
        `\n--- Processing Batch ${Math.floor(batchStart / batchSize) + 1} ---`,
      )
      console.log(
        `Accounts ${batchStart + 1} to ${batchEnd} of ${accounts.length}`,
      )
    }

    // Create array to hold transaction promises
    const batchTransactions = []

    // Prepare all transactions in the current batch
    for (let i = batchStart; i < batchEnd; i++) {
      const account = accounts[i]

      // Process this account (without awaiting yet)
      const txPromise = processAccountFn(account, i)
        .then((result) => {
          // Update results based on the transaction outcome
          if (result.success) {
            results.successful++
            if (result.gasUsed) {
              results.gasUsed += result.gasUsed
            }
          } else if (result.error?.includes("skipped")) {
            results.skipped++
          } else {
            results.failed++
          }

          // Store the transaction result
          results.transactions.push(result)
          return result
        })
        .catch((error) => {
          // Handle any unexpected errors in the processing function
          console.error("Unexpected error processing account:", error)
          results.failed++
          const result: TransactionResult = {
            success: false,
            account:
              typeof account === "object" && "address" in account
                ? (account as { address: string }).address
                : String(account),
            error: error.message,
          }
          results.transactions.push(result)
          return result
        })

      batchTransactions.push(txPromise)
    }

    // Wait for all transactions in this batch to complete
    if (batchTransactions.length > 0) {
      if (verbose) {
        console.log(
          `Waiting for ${batchTransactions.length} transactions to complete...`,
        )
      }
      await Promise.all(batchTransactions)
      if (verbose) {
        console.log(
          `Batch ${Math.floor(batchStart / batchSize) + 1} completed.`,
        )
      }
    }
  }

  return results
}
