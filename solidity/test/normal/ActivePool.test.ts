import { expect } from "chai"
import { ethers, network } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  NO_GAS,
  Contracts,
  ContractsState,
  TestingAddresses,
  setupTests,
  updateContractsSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"

describe("ActivePool", () => {
  let addresses: TestingAddresses
  let contracts: Contracts
  let state: ContractsState

  let borrowerOperationsSigner: HardhatEthersSigner

  beforeEach(async () => {
    ;({ state, contracts, addresses } = await setupTests())

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.borrowerOperations],
    })

    borrowerOperationsSigner = await ethers.getSigner(
      addresses.borrowerOperations,
    )
  })

  /**
   *
   * Expected Reverts
   *
   */
  context("Expected Reverts", () => {})

  /**
   *
   * Emitted Events
   *
   */
  context("Emitted Events", () => {})

  /**
   *
   * System State Changes
   *
   */
  context("System State Changes", () => {})

  /**
   *
   * Individual Troves
   *
   */
  context("Individual Troves", () => {})

  /**
   *
   * Balance changes
   *
   */
  context("Balance changes", () => {
    it("getCollateralBalance(): gets the recorded collateral balance", async () => {
      expect(await contracts.activePool.getCollateralBalance()).to.equal(0)
    })

    it("getMUSDDebt(): gets the recorded MUSD balance", async () => {
      expect(await contracts.activePool.getMUSDDebt()).to.equal(0)
    })

    it("increaseMUSDDebt(): increases the recorded MUSD balance by the correct amount", async () => {
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )
      const amount = to1e18("100")

      await contracts.activePool
        .connect(borrowerOperationsSigner)
        .increaseMUSDDebt(amount, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(
        state.activePool.debt.after - state.activePool.debt.before,
      ).to.equal(amount)
    })

    it("decreaseMUSDDebt(): decreases the recorded MUSD balance by the correct amount", async () => {
      const initialAmount = to1e18("100")

      await contracts.activePool
        .connect(borrowerOperationsSigner)
        .increaseMUSDDebt(initialAmount, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      const subtractedAmount = to1e18("75")

      await contracts.activePool
        .connect(borrowerOperationsSigner)
        .decreaseMUSDDebt(subtractedAmount, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.after).to.equal(
        state.activePool.debt.before - subtractedAmount,
      )
    })
  })

  /**
   *
   * Fees
   *
   */
  context("Fees", () => {})

  /**
   *
   * State change in other contracts
   *
   */
  context("State change in other contracts", () => {})
})
