import { expect } from "chai"

import {
  BORROWING_FEE_PAID,
  Contracts,
  ContractsState,
  TestingAddresses,
  User,
  addColl,
  getEventArgByName,
  openTrove,
  removeMintlist,
  setupTests,
  updatePendingSnapshot,
  updateRewardSnapshot,
  updateTroveManagerSnapshot,
  updateTroveSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"

describe("BorrowerOperations in Recovery Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let deployer: User
  let contracts: Contracts
  let state: ContractsState

  async function recoveryModeSetup() {
    // data setup
    const transactions = [
      {
        musdAmount: "10,000",
        sender: alice.wallet,
      },
      {
        musdAmount: "20,000",
        sender: bob.wallet,
      },
    ]

    for (let i = 0; i < transactions.length; i++) {
      await openTrove(contracts, transactions[i])
    }

    // collateral value drops from 50,000 to 10,000
    const price = to1e18("10,000")
    await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)
    expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(true)
  }

  async function setupCarolsTrove() {
    await openTrove(contracts, {
      musdAmount: "2,000",
      ICR: "500",
      sender: carol.wallet,
    })
  }

  beforeEach(async () => {
    ;({ alice, bob, carol, deployer, contracts, state, addresses } =
      await setupTests())

    await recoveryModeSetup()
  })

  describe("openTrove()", () => {
    it("Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
      // Carol opens at 150% ICR in Recovery Mode
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "150",
        sender: carol.wallet,
      })

      expect(await contracts.sortedTroves.contains(carol.address)).is.equal(
        true,
      )

      const status = await contracts.troveManager.getTroveStatus(carol.address)
      expect(status).is.equal(1)

      const price = await contracts.priceFeed.fetchPrice()
      const ICR = await contracts.troveManager.getCurrentICR(
        carol.wallet,
        price,
      )
      expect(ICR).is.equal(to1e18(150) / 100n)
    })

    it("Allows max fee < 0.5% in Recovery Mode", async () => {
      await openTrove(contracts, {
        musdAmount: "4,000",
        ICR: "200",
        sender: carol.wallet,
        maxFeePercentage: "0.4999999999999999",
      })
      const after = await contracts.musd.balanceOf(carol.wallet)
      expect(after).to.equal(to1e18("4,000"))
    })

    it("Records up-to-date initial snapshots of L_Collateral and L_MUSDDebt", async () => {
      // Liquidate Alice's Trove.
      await contracts.troveManager
        .connect(deployer.wallet)
        .liquidate(alice.wallet)

      /* with total stakes = 10 ether/tokens, after liquidation, L_Collateral should equal 1/10 ether/token per-ether-staked/per-tokens-staked,
      and L_MUSD should equal 18 mUSD per-ether-staked/per-tokens-staked. */

      const liquidatedCollateral = await contracts.troveManager.L_Collateral()
      const liquidatedPrincipal = await contracts.troveManager.L_Principal()

      expect(liquidatedCollateral).is.greaterThan(0n)
      expect(liquidatedPrincipal).is.greaterThan(0n)

      // Carol opens trove
      await openTrove(contracts, {
        musdAmount: "10,000",
        sender: carol.wallet,
      })

      // Check Carol's snapshots of L_Collateral and L_Principal equal the respective current values
      const snapshot = await contracts.troveManager.rewardSnapshots(
        carol.wallet,
      )
      expect(snapshot[0]).is.equal(liquidatedCollateral)
      expect(snapshot[1]).is.equal(liquidatedPrincipal)
    })

    context("Expected Reverts", () => {
      it("Reverts when system is in Recovery Mode and ICR < CCR", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: to1e18("2,000"),
            ICR: "149",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
        )
      })

      it("Reverts when trove ICR < MCR", async () => {
        await expect(
          openTrove(contracts, {
            musdAmount: to1e18("2,000"),
            ICR: "109",
            sender: carol.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
        )
      })
    })
  })

  describe("addColl()", () => {
    it("can add collateral in Recovery Mode", async () => {
      await updateTroveSnapshot(contracts, alice, "before")

      const collateralTopUp = to1e18(1)
      await addColl(contracts, {
        amount: collateralTopUp,
        sender: alice.wallet,
      })

      await updateTroveSnapshot(contracts, alice, "after")

      expect(alice.trove.collateral.after).to.equal(
        alice.trove.collateral.before + collateralTopUp,
      )
    })

    it("active Trove: applies pending rewards and updates user's L_Collateral, L_MUSDDebt snapshots", async () => {
      await openTrove(contracts, {
        musdAmount: "30,000",
        sender: carol.wallet,
      })

      // Liquidate Alice's Trove,
      await contracts.troveManager.liquidate(alice.address)
      expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
        false,
      )

      await updateTroveManagerSnapshot(contracts, state, "before")
      await updateTroveSnapshot(contracts, bob, "before")
      await updateTroveSnapshot(contracts, carol, "before")
      await updateRewardSnapshot(contracts, bob, "before")
      await updateRewardSnapshot(contracts, carol, "before")
      await updatePendingSnapshot(contracts, bob, "before")
      await updatePendingSnapshot(contracts, carol, "before")

      // check Bob and Carol's reward snapshots are zero before they alter their Troves
      expect(bob.rewardSnapshot.collateral.before).is.equal(0n)
      expect(bob.rewardSnapshot.principal.before).is.equal(0n)
      expect(carol.rewardSnapshot.collateral.before).is.equal(0n)
      expect(carol.rewardSnapshot.principal.before).is.equal(0n)

      // check Bob and Carol have pending reward and debt from the liquidation redistribution
      expect(carol.pending.collateral.before).to.greaterThan(0n)
      expect(bob.pending.collateral.before).to.greaterThan(0n)
      expect(carol.pending.principal.before).to.greaterThan(0n)
      expect(bob.pending.principal.before).to.greaterThan(0n)

      const bobTopUp = to1e18(5)
      await addColl(contracts, {
        amount: bobTopUp,
        sender: bob.wallet,
      })

      const carolTopUp = to1e18(1)
      await addColl(contracts, {
        amount: carolTopUp,
        sender: carol.wallet,
      })

      await updateTroveSnapshot(contracts, bob, "after")
      await updateTroveSnapshot(contracts, carol, "after")

      expect(bob.trove.collateral.after).to.equal(
        bob.trove.collateral.before + bobTopUp + bob.pending.collateral.before,
      )
      expect(bob.trove.debt.after).to.equal(
        bob.trove.debt.before + bob.pending.principal.before,
      )
      expect(carol.trove.collateral.after).to.equal(
        carol.trove.collateral.before +
          carolTopUp +
          carol.pending.collateral.before,
      )
      expect(carol.trove.debt.after).to.equal(
        carol.trove.debt.before + carol.pending.principal.before,
      )

      /* Check that both Bob and Carol's snapshots of the rewards-per-unit-staked metrics should be updated
      to the latest values of L_Collateral and L_MUSDDebt */

      await updateRewardSnapshot(contracts, bob, "after")
      await updateRewardSnapshot(contracts, carol, "after")

      expect(bob.rewardSnapshot.collateral.after).is.equal(
        state.troveManager.liquidation.collateral.before,
      )
      expect(bob.rewardSnapshot.principal.after).is.equal(
        state.troveManager.liquidation.principal.before,
      )
      expect(carol.rewardSnapshot.collateral.after).is.equal(
        state.troveManager.liquidation.collateral.before,
      )
      expect(carol.rewardSnapshot.principal.after).is.equal(
        state.troveManager.liquidation.principal.before,
      )
    })

    it("no mintlist, can add collateral", async () => {
      await updateTroveSnapshot(contracts, alice, "before")
      await removeMintlist(contracts, deployer.wallet)

      const collateralTopUp = to1e18(1)
      await addColl(contracts, {
        amount: collateralTopUp,
        sender: alice.wallet,
      })

      await updateTroveSnapshot(contracts, alice, "after")
      expect(alice.trove.collateral.after).to.equal(
        alice.trove.collateral.before + collateralTopUp,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when top-up would leave trove with ICR < MCR", async () => {
        const price = to1e18("25,000")
        await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)

        await openTrove(contracts, {
          musdAmount: "20,000",
          ICR: "500",
          sender: carol.wallet,
        })

        expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
          false,
        )
        expect(
          await contracts.troveManager.getCurrentICR(alice.address, price),
        ).to.lessThan(to1e18(110))
        const collateralTopUp = to1e18(0.001)

        await expect(
          addColl(contracts, {
            amount: collateralTopUp,
            sender: alice.wallet,
          }),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
        )
      })

      it("reverts if trove is non-existent", async () => {
        await expect(
          addColl(contracts, {
            amount: 1n,
            sender: carol.wallet,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      it("reverts if trove is closed", async () => {
        await contracts.troveManager.liquidate(alice.address)
        await expect(
          addColl(contracts, {
            amount: 1n,
            sender: alice.wallet,
          }),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })
    })
  })

  describe("withdrawColl()", () => {
    context("Expected Reverts", () => {
      it("reverts if system is in Recovery Mode", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .withdrawColl(1n, alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: Collateral withdrawal not permitted Recovery Mode",
        )
      })

      it("no mintlist, reverts if system is in Recovery Mode", async () => {
        await removeMintlist(contracts, deployer.wallet)
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .withdrawColl(1n, alice.wallet, alice.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: Collateral withdrawal not permitted Recovery Mode",
        )
      })
    })
  })

  describe("withdrawMUSD", () => {
    context("Expected Reverts", () => {
      it("reverts when system is in Recovery Mode", async () => {
        const maxFeePercentage = to1e18(1)
        const amount = 1n

        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .withdrawMUSD(maxFeePercentage, amount, bob.wallet, bob.wallet),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
        )
      })
    })
  })

  describe("repayMUSD", () => {
    it("can repay debt in Recovery Mode", async () => {
      const amount = to1e18("1,000")
      await updateTroveSnapshot(contracts, bob, "before")
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .repayMUSD(amount, bob.wallet, bob.wallet)
      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.debt.after).to.equal(bob.trove.debt.before - amount)
    })

    it("no mintlist, can repay debt in Recovery Mode", async () => {
      await removeMintlist(contracts, deployer.wallet)

      const amount = to1e18("1,000")
      await updateTroveSnapshot(contracts, bob, "before")
      await contracts.borrowerOperations
        .connect(bob.wallet)
        .repayMUSD(amount, bob.wallet, bob.wallet)
      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.debt.after).to.equal(bob.trove.debt.before - amount)
    })
  })

  describe("closeTrove", () => {
    it("no mintlist, succeeds when in Recovery Mode", async () => {
      await removeMintlist(contracts, deployer.wallet)
      await contracts.musd
        .connect(alice.wallet)
        .transfer(bob.address, to1e18("2,000"))
      await contracts.borrowerOperations.connect(bob.wallet).closeTrove()

      await updateTroveSnapshot(contracts, bob, "after")
      expect(bob.trove.status.after).to.equal(2)
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(false)
    })

    it("no mintlist, succeeds when trove is the only one in the system", async () => {
      await removeMintlist(contracts, deployer.wallet)

      await contracts.musd.unprotectedMint(alice.wallet, to1e18("2,000"))
      await contracts.musd.unprotectedMint(bob.wallet, to1e18("2,000"))

      await contracts.borrowerOperations.connect(alice.wallet).closeTrove()
      await contracts.borrowerOperations.connect(bob.wallet).closeTrove()

      await updateTroveSnapshot(contracts, bob, "after")
      expect(bob.trove.status.after).to.equal(2)
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(false)

      expect(await contracts.sortedTroves.isEmpty()).to.equal(true)
    })

    context("Expected Reverts", () => {
      it("reverts when system is in Recovery Mode", async () => {
        await contracts.musd
          .connect(alice.wallet)
          .transfer(bob.address, to1e18("2,000"))
        await expect(
          contracts.borrowerOperations.connect(bob.wallet).closeTrove(),
        ).to.be.revertedWith(
          "BorrowerOps: Operation not permitted during Recovery Mode",
        )
      })
    })
  })

  describe("adjustTrove", () => {
    it("A trove with ICR < CCR in Recovery Mode can adjust their trove to ICR > CCR", async () => {
      const maxFeePercentage = to1e18(1)
      const collChange = to1e18("20")

      await updateTroveSnapshot(contracts, alice, "before")
      // collateral deposit that would increase ICR > CCR
      await contracts.borrowerOperations
        .connect(alice.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          0,
          false,
          collChange,
          alice.wallet,
          alice.wallet,
          {
            value: collChange,
          },
        )
      await updateTroveSnapshot(contracts, alice, "after")
      const ccr = await contracts.troveManager.CCR()
      expect(alice.trove.icr.before).to.be.lessThan(ccr)
      expect(alice.trove.icr.after).to.be.greaterThan(ccr)
    })

    it("A trove with ICR > CCR in Recovery Mode can improve their ICR", async () => {
      const maxFeePercentage = to1e18(1)
      const collChange = to1e18("20")

      await setupCarolsTrove()
      await updateTroveSnapshot(contracts, carol, "before")
      // collateral deposit that would increase ICR > CCR
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          0,
          false,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )
      await updateTroveSnapshot(contracts, carol, "after")
      const ccr = await contracts.troveManager.CCR()
      expect(carol.trove.icr.before).to.be.greaterThan(ccr)
      expect(carol.trove.icr.after).to.be.greaterThan(carol.trove.icr.before)
    })

    it("allows max fee < 0.5% in Recovery mode", async () => {
      const maxFeePercentage = 4999999999999999n
      const collChange = to1e18("20")
      const debtChange = to1e18("2,000")

      await setupCarolsTrove()
      await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          true,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )
    })

    it("debt increase in Recovery Mode charges no fee", async () => {
      const maxFeePercentage = to1e18(1)
      const collChange = to1e18("20")
      const debtChange = to1e18("2,000")

      await setupCarolsTrove()

      state.pcv.musd.before = await contracts.musd.balanceOf(addresses.pcv)

      const tx = await contracts.borrowerOperations
        .connect(carol.wallet)
        .adjustTrove(
          maxFeePercentage,
          0,
          debtChange,
          true,
          collChange,
          carol.wallet,
          carol.wallet,
          {
            value: collChange,
          },
        )

      const emittedFee = await getEventArgByName(
        tx,
        BORROWING_FEE_PAID,
        "BorrowingFeePaid",
        1,
      )
      expect(emittedFee).to.be.equal(0)

      // Check no fee was sent to PCV contract
      state.pcv.musd.after = await contracts.musd.balanceOf(addresses.pcv)
      expect(state.pcv.musd.after).to.be.equal(state.pcv.musd.before)
    })

    context("Expected Reverts", () => {
      it("reverts in Recovery Mode when the adjustment would reduce the TCR", async () => {
        const maxFeePercentage = to1e18(1)
        const debtChange = to1e18(5000)
        const collChange = to1e18(0.0001)
        await setupCarolsTrove()

        // collateral withdrawal
        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .adjustTrove(
              maxFeePercentage,
              collChange,
              0,
              false,
              0,
              carol.wallet,
              carol.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Collateral withdrawal not permitted Recovery Mode",
        )

        // debt increase
        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .adjustTrove(
              maxFeePercentage,
              0,
              debtChange,
              true,
              0,
              carol.wallet,
              carol.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode",
        )

        // debt increase and small collateral increase
        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .adjustTrove(
              maxFeePercentage,
              0,
              debtChange,
              true,
              collChange,
              carol.wallet,
              carol.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode",
        )
      })

      it("collateral withdrawal reverts in Recovery Mode", async () => {
        const maxFeePercentage = to1e18(1)
        const collChange = to1e18(0.0001)
        await setupCarolsTrove()

        // collateral withdrawal
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              maxFeePercentage,
              collChange,
              0,
              false,
              0,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Collateral withdrawal not permitted Recovery Mode",
        )
      })

      it("no mintlist, collateral withdrawal reverts in Recovery Mode", async () => {
        const maxFeePercentage = to1e18(1)
        const collChange = to1e18(0.0001)
        await setupCarolsTrove()
        await removeMintlist(contracts, deployer.wallet)

        // collateral withdrawal
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              maxFeePercentage,
              collChange,
              0,
              false,
              0,
              alice.wallet,
              alice.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Collateral withdrawal not permitted Recovery Mode",
        )
      })

      it("debt increase that would leave ICR < CCR (150%) reverts in Recovery Mode", async () => {
        const maxFeePercentage = to1e18(1)
        const collChange = to1e18(1)
        const debtChange = to1e18("2,000")

        await setupCarolsTrove()

        // collateral withdrawal
        await expect(
          contracts.borrowerOperations
            .connect(alice.wallet)
            .adjustTrove(
              maxFeePercentage,
              0,
              debtChange,
              true,
              collChange,
              alice.wallet,
              alice.wallet,
              {
                value: collChange,
              },
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
        )
      })

      it("debt increase that would reduce the ICR reverts in Recovery Mode", async () => {
        const maxFeePercentage = to1e18(1)
        const debtChange = to1e18("2,000")

        await setupCarolsTrove()
        await updateTroveSnapshot(contracts, carol, "before")

        // collateral withdrawal that would reduce carols ICR from 500% to 250%
        await expect(
          contracts.borrowerOperations
            .connect(carol.wallet)
            .adjustTrove(
              maxFeePercentage,
              0,
              debtChange,
              true,
              0,
              carol.wallet,
              carol.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode",
        )

        const price = await contracts.priceFeed.fetchPrice()
        const icr = await contracts.troveManager.computeICR(
          carol.trove.collateral.before,
          carol.trove.debt.before + debtChange,
          price,
        )
        const ccr = await contracts.troveManager.CCR()
        expect(icr).to.be.greaterThan(ccr)

        // --- Bob with ICR < 150% tries to reduce his ICR ---

        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .adjustTrove(
              maxFeePercentage,
              0,
              debtChange,
              true,
              0,
              bob.wallet,
              bob.wallet,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Operation must leave trove with ICR >= CCR",
        )
      })
    })
  })
})
