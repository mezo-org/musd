import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { to1e18 } from "../../utils"

import {
  Contracts,
  ContractsState,
  TestSetup,
  User,
  connectContracts,
  fixture,
  openTrove,
  performRedemption,
  updateCollSurplusSnapshot,
  updateTroveSnapshot,
} from "../../helpers"

describe("CollSurplusPool in Normal Mode", () => {
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  let alice: User
  let bob: User
  let whale: User

  let state: ContractsState

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    // users
    ;({ alice, bob, whale } = testSetup.users)
    state = testSetup.state

    await connectContracts(contracts, testSetup.users)
  })

  describe("getCollateralBalance()", () => {
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
    context("System State Changes", () => {
      it("getCollateralBalance(): Returns the collateral balance of the CollSurplusPool after redemption", async () => {
        await openTrove(contracts, {
          musdAmount: "50,000",
          ICR: "500",
          sender: whale.wallet,
        })

        const { netDebt } = await openTrove(contracts, {
          musdAmount: to1e18("2,000"),
          sender: alice.wallet,
        })

        // Whale sends Bob enough MUSD to liquidate Alice
        await contracts.musd.connect(whale.wallet).transfer(bob.wallet, netDebt)

        await updateTroveSnapshot(contracts, alice, "before")
        await updateCollSurplusSnapshot(contracts, state, "before")

        await performRedemption(contracts, bob, alice, netDebt)

        await updateTroveSnapshot(contracts, alice, "after")
        await updateCollSurplusSnapshot(contracts, state, "after")

        const liquidatedCollateral =
          (netDebt * to1e18(1)) / (await contracts.priceFeed.fetchPrice())

        const netCollSurplusChange =
          state.collSurplusPool.collateral.after -
          state.collSurplusPool.collateral.before

        const aliceCollateralChange =
          alice.trove.collateral.before - alice.trove.collateral.after

        expect(netCollSurplusChange).to.equal(
          aliceCollateralChange - liquidatedCollateral,
        )
      })
    })

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
    context("Balance changes", () => {})

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
})
