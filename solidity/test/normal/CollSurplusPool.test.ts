import { expect } from "chai"
import { to1e18 } from "../utils"

import {
  NO_GAS,
  Contracts,
  ContractsState,
  User,
  openTrove,
  performRedemption,
  setupTests,
  updateCollSurplusPoolUserSnapshot,
  updateCollSurplusSnapshot,
  updateTroveSnapshot,
  updateWalletSnapshot,
} from "../helpers"

describe("CollSurplusPool in Normal Mode", () => {
  let contracts: Contracts

  let alice: User
  let bob: User
  let whale: User

  let state: ContractsState

  beforeEach(async () => {
    ;({ alice, bob, whale, state, contracts } = await setupTests())
  })

  describe("accountSurplus()", () => {
    context("Expected Reverts", () => {
      it("Reverts if caller is not Trove Manager", async () => {
        await expect(
          contracts.collSurplusPool
            .connect(alice.wallet)
            .accountSurplus(alice.wallet, to1e18(1)),
        ).to.be.revertedWith("CollSurplusPool: Caller is not TroveManager")
      })
    })
  })

  describe("claimColl()", () => {
    it("Allows a user to claim their collateral after their trove was redeemed", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "500",
        sender: whale.wallet,
      })

      const { netDebt } = await openTrove(contracts, {
        musdAmount: to1e18("2,000"),
        sender: alice.wallet,
      })

      // Whale sends Bob enough mUSD to liquidate Alice
      await contracts.musd.connect(whale.wallet).transfer(bob.wallet, netDebt)

      await updateTroveSnapshot(contracts, alice, "before")
      await updateWalletSnapshot(contracts, alice, "before")

      await performRedemption(contracts, bob, alice, netDebt)

      await contracts.borrowerOperations
        .connect(alice.wallet)
        .claimCollateral(NO_GAS)

      await updateWalletSnapshot(contracts, alice, "after")

      const liquidatedCollateral =
        (netDebt * to1e18(1)) / (await contracts.priceFeed.fetchPrice())

      expect(alice.btc.after - alice.btc.before).to.equal(
        alice.trove.collateral.before - liquidatedCollateral,
      )
    })

    context("Expected Reverts", () => {
      it("Reverts if caller is not Borrower Operations", async () => {
        await expect(
          contracts.collSurplusPool
            .connect(alice.wallet)
            .claimColl(alice.wallet),
        ).to.be.revertedWith(
          "CollSurplusPool: Caller is not Borrower Operations",
        )
      })

      it("Reverts if nothing to claim", async () => {
        await expect(
          contracts.borrowerOperations.connect(alice.wallet).claimCollateral(),
        ).to.be.revertedWith(
          "CollSurplusPool: No collateral available to claim",
        )
      })
    })
  })

  it("getCollateral()", async () => {
    it("Retrieves how much collateral a user can redeem", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "500",
        sender: whale.wallet,
      })

      const { netDebt } = await openTrove(contracts, {
        musdAmount: to1e18("2,000"),
        sender: alice.wallet,
      })

      // Whale sends Bob enough mUSD to liquidate Alice
      await contracts.musd.connect(whale.wallet).transfer(bob.wallet, netDebt)

      await updateTroveSnapshot(contracts, alice, "before")

      await performRedemption(contracts, bob, alice, netDebt)

      await updateCollSurplusPoolUserSnapshot(contracts, alice, "after")

      const liquidatedCollateral =
        (netDebt * to1e18(1)) / (await contracts.priceFeed.fetchPrice())

      expect(alice.collSurplusPool.collateral.after).to.equal(
        alice.trove.collateral.before - liquidatedCollateral,
      )
    })

    it("Returns 0 for users with no redeemable collateral", async () => {
      await updateCollSurplusPoolUserSnapshot(contracts, bob, "after")

      expect(bob.collSurplusPool.collateral.after).to.equal(0n)
    })
  })

  describe("getCollateralBalance()", () => {
    it("Returns the collateral balance of the CollSurplusPool after redemption", async () => {
      await openTrove(contracts, {
        musdAmount: "50,000",
        ICR: "500",
        sender: whale.wallet,
      })

      const { netDebt } = await openTrove(contracts, {
        musdAmount: to1e18("2,000"),
        sender: alice.wallet,
      })

      // Whale sends Bob enough mUSD to liquidate Alice
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

  describe("receive()", () => {
    context("Expected Reverts", () => {
      it("Reverts when the caller is not the Active Pool", async () => {
        const collSurplusPoolAddress =
          await contracts.collSurplusPool.getAddress()

        await expect(
          alice.wallet.sendTransaction({
            to: collSurplusPoolAddress,
            value: 100n,
          }),
        ).to.be.revertedWith("CollSurplusPool: Caller is not Active Pool")
      })
    })
  })
})
