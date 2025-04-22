// scripts/scale-testing/state-manager.ts
import * as fs from "fs"
import * as path from "path"
import { ethers } from "hardhat"
import { StateFile } from "./types"

export default class StateManager {
  private filePath: string

  private state: StateFile

  constructor(networkName: string) {
    const outputDir = path.join(__dirname, "..", "..", "scale-testing")
    this.filePath = path.join(outputDir, `account-state-${networkName}.json`)

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Initialize or load the state file
    this.loadState(networkName)
  }

  /**
   * Load the state file or create a new one if it doesn't exist
   */
  private loadState(networkName: string) {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, "utf8")
        this.state = JSON.parse(data)
        console.log(
          `Loaded account state file with ${Object.keys(this.state.accounts).length} accounts`,
        )
      } else {
        // Create new state file
        this.state = {
          lastUpdated: new Date().toISOString(),
          networkName,
          accounts: {},
        }
        this.saveState()
        console.log(`Created new account state file at ${this.filePath}`)
      }
    } catch (error) {
      console.error(`Error loading state file: ${error.message}`)
      // Create new state file if loading fails
      this.state = {
        lastUpdated: new Date().toISOString(),
        networkName,
        accounts: {},
      }
      this.saveState()
    }
  }

  /**
   * Save the current state to the file
   */
  public saveState() {
    this.state.lastUpdated = new Date().toISOString()
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2))
    return this.state
  }

  /**
   * Initialize accounts from wallet file
   */
  public initializeFromWalletFile(walletFilePath: string) {
    try {
      if (!fs.existsSync(walletFilePath)) {
        throw new Error(`Wallet file not found at ${walletFilePath}`)
      }

      const walletData = JSON.parse(fs.readFileSync(walletFilePath, "utf8"))

      // Add accounts that don't exist yet
      let newAccounts = 0
      for (const wallet of walletData) {
        if (!this.state.accounts[wallet.address]) {
          this.state.accounts[wallet.address] = {
            address: wallet.address,
            index: wallet.index,
            hasTrove: false,
            usedInTests: [],
          }
          newAccounts++
        }
      }

      console.log(`Added ${newAccounts} new accounts to the state file`)
      this.saveState()

      return newAccounts
    } catch (error) {
      console.error(`Error initializing from wallet file: ${error.message}`)
      return 0
    }
  }

  /**
   * Get accounts that match specific criteria
   */
  public getAccounts(criteria: {
    hasTrove?: boolean
    minBtcBalance?: string
    minMusdBalance?: string
    minInterestRate?: string
    notUsedInTest?: string
    limit?: number
  }) {
    const {
      hasTrove,
      minBtcBalance,
      minMusdBalance,
      minInterestRate,
      notUsedInTest,
      limit,
    } = criteria

    // Check if we're in loop mode (from environment variable)
    const isLoopMode = process.env.LOOP_MODE === "true"

    let filteredAccounts = Object.values(this.state.accounts)

    // Filter by Trove status if specified
    if (hasTrove !== undefined) {
      filteredAccounts = filteredAccounts.filter(
        (account) => account.hasTrove === hasTrove,
      )
    }

    // Filter by minimum BTC balance if specified
    if (minBtcBalance !== undefined) {
      const minBtc = parseFloat(minBtcBalance)
      filteredAccounts = filteredAccounts.filter((account) => {
        if (!account.btcBalance) return false
        return parseFloat(account.btcBalance) >= minBtc
      })
    }

    // Filter by minimum MUSD balance if specified
    if (minMusdBalance !== undefined) {
      const minMusd = parseFloat(minMusdBalance)
      filteredAccounts = filteredAccounts.filter((account) => {
        if (!account.musdBalance) return false
        return parseFloat(account.musdBalance) >= minMusd
      })
    }

    // Filter by minimum interest rate if specified
    if (minInterestRate !== undefined) {
      const minRate = parseFloat(minInterestRate)
      filteredAccounts = filteredAccounts.filter((account) => {
        if (!account.interestRate) return false
        return parseFloat(account.interestRate) >= minRate
      })
    }

    // Filter by test participation if specified
    if (notUsedInTest !== undefined && !isLoopMode) {
      filteredAccounts = filteredAccounts.filter(
        (account) => !account.usedInTests.includes(notUsedInTest),
      )
    }

    // Limit the number of results if specified
    if (limit !== undefined && limit > 0) {
      filteredAccounts = filteredAccounts.slice(0, limit)
    }

    return filteredAccounts
  }

  /**
   * Record an action for an account
   */
  public recordAction(address: string, action: string, testId?: string) {
    const account = this.state.accounts[address]
    if (!account) {
      console.error(`Account ${address} not found in state file`)
      return false
    }

    account.lastAction = action
    account.lastActionTime = new Date().toISOString()

    if (testId && !account.usedInTests.includes(testId)) {
      account.usedInTests.push(testId)
    }

    this.saveState()
    return true
  }

  /**
   * Get the full state
   */
  public getState() {
    return this.state
  }

  /**
   * Get a specific account
   */
  public getAccount(address: string) {
    return this.state.accounts[address]
  }

  /**
   * Generic batch processing helper for updating account states
   * @param accountsToUpdate List of account addresses to process
   * @param processFn Function to process a single account and return address if successful, null if failed
   * @param batchSize Size of batches to process in parallel
   * @returns Number of successfully processed accounts
   */
  private async processBatchedAccounts<T>(
    accountsToUpdate: string[],
    processFn: (address: string) => Promise<string | null>,
    batchSize: number = 20,
  ): Promise<number> {
    let updated = 0

    // Process in batches
    for (let i = 0; i < accountsToUpdate.length; i += batchSize) {
      const batch = accountsToUpdate.slice(i, i + batchSize)
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(accountsToUpdate.length / batchSize)}...`,
      )

      // Process batch in parallel
      const batchPromises = batch.map((address) => processFn(address))

      // Wait for all promises in the batch to resolve
      const batchResults = await Promise.all(batchPromises)

      // Count successful updates
      const batchUpdated = batchResults.filter(
        (result) => result !== null,
      ).length
      updated += batchUpdated

      console.log(
        `Batch completed. Updated ${batchUpdated}/${batch.length} accounts in this batch.`,
      )

      // Save state after each batch
      this.saveState()
      console.log(
        `Updated ${updated}/${accountsToUpdate.length} accounts so far...`,
      )
    }

    this.saveState()
    return updated
  }

  /**
   * Update Trove information for accounts in parallel batches
   */
  public async updateTroveStates(
    troveManagerAddress: string,
    addresses: string[] = [],
    batchSize: number = 20,
  ) {
    const accountsToUpdate =
      addresses.length > 0 ? addresses : Object.keys(this.state.accounts)

    console.log(
      `Updating Trove states for ${accountsToUpdate.length} accounts using batch size ${batchSize}...`,
    )

    // Get TroveManager contract
    const troveManager = await ethers.getContractAt(
      "TroveManager",
      troveManagerAddress,
    )

    const updated = await this.processBatchedAccounts(
      accountsToUpdate,
      async (address) => {
        try {
          const account = this.state.accounts[address]
          if (!account) return null

          // Get Trove information
          const troveData = await troveManager.Troves(address)

          // Status enum: 0 = nonExistent, 1 = active, 2 = closedByOwner, 3 = closedByLiquidation, 4 = closedByRedemption
          const status = Number(troveData.status)
          account.hasTrove = status === 1 // 1 = active

          if (status === 1) {
            // Calculate total debt (principal + interest)
            const totalDebt = troveData.principal + troveData.interestOwed

            account.troveDebt = ethers.formatEther(totalDebt)
            account.troveCollateral = ethers.formatEther(troveData.coll)
          } else {
            account.troveDebt = "0"
            account.troveCollateral = "0"
          }

          account.interestRate = ethers.formatUnits(troveData.interestRate, 4)

          // Only store troveStatus if it exists in the AccountState type
          if ("troveStatus" in account) {
            account.troveStatus = status
          }

          account.lastTroveUpdate = new Date().toISOString()
          return address
        } catch (error) {
          console.error(
            `Error updating Trove state for ${address}: ${error.message}`,
          )
          return null
        }
      },
      batchSize,
    )

    console.log(`Updated Trove states for ${updated} accounts`)
    return updated
  }

  /**
   * Update MUSD balances for accounts in parallel batches
   */
  public async updateMusdBalances(
    musdAddress: string,
    addresses: string[] = [],
    batchSize: number = 20,
  ) {
    const accountsToUpdate =
      addresses.length > 0 ? addresses : Object.keys(this.state.accounts)

    console.log(
      `Updating MUSD balances for ${accountsToUpdate.length} accounts using batch size ${batchSize}...`,
    )

    // Get MUSD contract
    const musdContract = await ethers.getContractAt("MUSD", musdAddress)

    const updated = await this.processBatchedAccounts(
      accountsToUpdate,
      async (address) => {
        try {
          const account = this.state.accounts[address]
          if (!account) return null

          // Get MUSD balance
          const musdBalance = await musdContract.balanceOf(address)
          account.musdBalance = ethers.formatEther(musdBalance)
          account.lastBalanceUpdate = new Date().toISOString()
          return address
        } catch (error) {
          console.error(
            `Error updating MUSD balance for ${address}: ${error.message}`,
          )
          return null
        }
      },
      batchSize,
    )

    console.log(`Updated MUSD balances for ${updated} accounts`)
    return updated
  }

  /**
   * Update BTC balances for accounts in parallel batches
   */
  public async updateBtcBalances(
    addresses: string[] = [],
    batchSize: number = 20,
  ) {
    const accountsToUpdate =
      addresses.length > 0 ? addresses : Object.keys(this.state.accounts)

    console.log(
      `Updating BTC balances for ${accountsToUpdate.length} accounts using batch size ${batchSize}...`,
    )

    const updated = await this.processBatchedAccounts(
      accountsToUpdate,
      async (address) => {
        try {
          const account = this.state.accounts[address]
          if (!account) return null

          // Get BTC balance
          const btcBalance = await ethers.provider.getBalance(address)
          account.btcBalance = ethers.formatEther(btcBalance)
          account.lastBalanceUpdate = new Date().toISOString()
          return address
        } catch (error) {
          console.error(
            `Error updating BTC balance for ${address}: ${error.message}`,
          )
          return null
        }
      },
      batchSize,
    )

    console.log(`Updated BTC balances for ${updated} accounts`)
    return updated
  }
}
