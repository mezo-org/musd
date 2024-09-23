import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { ethers, network } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  connectContracts,
  Contracts,
  ContractsState,
  fixture,
  getAddresses,
  NO_GAS,
  TestingAddresses,
  TestSetup,
  updateContractsSnapshot,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("ActivePool", () => {
  let addresses: TestingAddresses
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let state: ContractsState
  let testSetup: TestSetup

  let borrowerOperationsSigner: HardhatEthersSigner

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    state = testSetup.state

    await connectContracts(contracts, testSetup.users)
    addresses = await getAddresses(contracts, testSetup.users)

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

      await contracts.activePool
        .connect(borrowerOperationsSigner)
        .decreaseMUSDDebt(amount, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.before).to.equal(state.activePool.debt.after)
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
