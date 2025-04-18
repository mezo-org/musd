export interface AccountState {
  // Basic information
  address: string
  index: number

  // Balance information
  btcBalance?: string
  musdBalance?: string
  lastBalanceUpdate?: string

  // Trove information
  hasTrove: boolean
  troveCollateral?: string
  troveDebt?: string
  lastTroveUpdate?: string
  interestRate?: string

  // Stability Pool
  stabilityPoolDeposit?: string

  // Activity tracking
  lastAction?: string
  lastActionTime?: string

  // Test participation
  usedInTests: string[]
}

export interface StateFile {
  lastUpdated: string
  networkName: string
  accounts: { [address: string]: AccountState }
}
