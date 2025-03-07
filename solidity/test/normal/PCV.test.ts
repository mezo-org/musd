import { expect } from "chai"
import { ethers } from "hardhat"
import {
  Contracts,
  ContractsState,
  createLiquidationEvent,
  fastForwardTime,
  getEmittedPCVtoSPDepositValues,
  getEmittedSPtoPCVWithdrawalValues,
  getEmittedWithdrawCollateralValues,
  getLatestBlockTimestamp,
  openTrove,
  setupTests,
  TestingAddresses,
  updatePCVSnapshot,
  updateStabilityPoolSnapshot,
  updateWalletSnapshot,
  User,
} from "../helpers"
import { to1e18 } from "../utils"
import { ZERO_ADDRESS } from "../../helpers/constants"
import { PCV } from "../../typechain"

describe("PCV", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let council: User
  let deployer: User
  let whale: User
  let contracts: Contracts
  let treasury: User
  let state: ContractsState

  let bootstrapLoan: bigint
  let delay: bigint

  let PCVDeployer: PCV

  async function debtPaid() {
    const debtToPay = await contracts.pcv.debtToPay()
    await contracts.musd.unprotectedMint(addresses.pcv, debtToPay)
    await contracts.pcv.connect(treasury.wallet).distributeMUSD(debtToPay)
  }

  beforeEach(async () => {
    ;({
      alice,
      bob,
      council,
      deployer,
      whale,
      treasury,
      state,
      contracts,
      addresses,
    } = await setupTests())

    // for ease of use when calling onlyOwner* functions
    PCVDeployer = contracts.pcv.connect(deployer.wallet)

    bootstrapLoan = await contracts.pcv.BOOTSTRAP_LOAN()
    await PCVDeployer.initializeDebt()
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await PCVDeployer.finalizeChangingRoles()
    await contracts.pcv
      .connect(deployer.wallet)
      .addRecipientsToWhitelist([
        alice.address,
        council.address,
        treasury.address,
      ])

    delay = await contracts.pcv.governanceTimeDelay()
  })

  describe("initializeDebt()", () => {
    it("bootstrap loan deposited to SP and tracked in PCV", async () => {
      const debtToPay = await contracts.pcv.debtToPay()
      expect(debtToPay).to.equal(bootstrapLoan)

      const pcvBalance = await ethers.provider.getBalance(addresses.pcv)
      expect(pcvBalance).to.equal(0n)

      const spBalance = await contracts.stabilityPool.getCompoundedMUSDDeposit(
        addresses.pcv,
      )
      expect(spBalance).to.equal(bootstrapLoan)
    })

    context("Expected Reverts", () => {
      it("reverts when trying to initialize second time", async () => {
        await expect(PCVDeployer.initializeDebt()).to.be.revertedWith(
          "PCV: already initialized",
        )
      })
    })
  })

  describe("startChangingRoles()", () => {
    it("adds new roles as pending", async () => {
      await PCVDeployer.startChangingRoles(alice.address, bob.address)
      expect(await contracts.pcv.council()).to.equal(council.address)
      expect(await contracts.pcv.treasury()).to.equal(treasury.address)
      expect(await contracts.pcv.pendingCouncilAddress()).to.equal(
        alice.address,
      )
      expect(await contracts.pcv.pendingTreasuryAddress()).to.equal(bob.address)
    })

    it("speeds up first setting of roles", async () => {
      // reset roles first
      await PCVDeployer.startChangingRoles(ZERO_ADDRESS, ZERO_ADDRESS)
      await fastForwardTime(Number(delay))
      await PCVDeployer.finalizeChangingRoles()

      await PCVDeployer.startChangingRoles(alice.address, bob.address)
      const timeNow = await getLatestBlockTimestamp()
      expect(Number(await contracts.pcv.changingRolesInitiated())).to.equal(
        Number(timeNow) - Number(delay),
      )
    })

    context("Expected Reverts", () => {
      it("reverts when trying to set same roles twice", async () => {
        await expect(
          PCVDeployer.startChangingRoles(council.address, treasury.address),
        ).to.be.revertedWith("PCV: these roles already set")
      })
    })
  })

  describe("cancelChangingRoles()", () => {
    it("resets pending roles", async () => {
      await PCVDeployer.startChangingRoles(alice.address, bob.address)
      await PCVDeployer.cancelChangingRoles()
      expect(await contracts.pcv.pendingCouncilAddress()).to.equal(ZERO_ADDRESS)
      expect(await contracts.pcv.pendingTreasuryAddress()).to.equal(
        ZERO_ADDRESS,
      )
      expect(await contracts.pcv.treasury()).to.equal(treasury.address)
      expect(await contracts.pcv.council()).to.equal(council.address)
    })

    context("Expected Reverts", () => {
      it("reverts when changing is not initiated", async () => {
        await expect(PCVDeployer.cancelChangingRoles()).to.be.revertedWith(
          "PCV: Change not initiated",
        )
      })
    })
  })

  describe("finalizeChangingRoles()", () => {
    it("sets new roles", async () => {
      await PCVDeployer.startChangingRoles(alice.address, bob.address)
      await fastForwardTime(Number(delay))
      await PCVDeployer.finalizeChangingRoles()
      expect(await contracts.pcv.council()).to.equal(alice.address)
      expect(await contracts.pcv.treasury()).to.equal(bob.address)
      expect(await contracts.pcv.pendingCouncilAddress()).to.equal(ZERO_ADDRESS)
      expect(await contracts.pcv.pendingTreasuryAddress()).to.equal(
        ZERO_ADDRESS,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when changing is not initiated", async () => {
        await expect(PCVDeployer.finalizeChangingRoles()).to.be.revertedWith(
          "PCV: Change not initiated",
        )
      })

      it("reverts when not enough time has passed", async () => {
        await PCVDeployer.startChangingRoles(alice.address, bob.address)
        await expect(PCVDeployer.finalizeChangingRoles()).to.be.revertedWith(
          "PCV: Governance delay has not elapsed",
        )
      })
    })
  })

  describe("depositToStabilityPool()", () => {
    it("deposits additional mUSD to StabilityPool from PCV", async () => {
      const depositAmount = to1e18("20")
      await contracts.musd.unprotectedMint(addresses.pcv, depositAmount)

      await updatePCVSnapshot(contracts, state, "before")
      await updateStabilityPoolSnapshot(contracts, state, "before")

      const tx = await PCVDeployer.depositToStabilityPool(depositAmount)

      await updatePCVSnapshot(contracts, state, "after")
      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.pcv.musd.before).to.equal(depositAmount)
      expect(state.pcv.musd.after).to.equal(0)
      expect(state.stabilityPool.musd.before).to.equal(bootstrapLoan)
      expect(state.stabilityPool.musd.after).to.equal(
        bootstrapLoan + depositAmount,
      )

      const spBalance = await contracts.stabilityPool.getCompoundedMUSDDeposit(
        addresses.pcv,
      )
      expect(state.stabilityPool.musd.after).to.equal(spBalance)

      const { musdAmount } = await getEmittedPCVtoSPDepositValues(tx)
      expect(depositAmount).to.equal(musdAmount)
    })

    context("Expected Reverts", () => {
      it("reverts when trying to deposit 0 mUSD", async () => {
        await expect(PCVDeployer.depositToStabilityPool(0n)).to.be.revertedWith(
          "StabilityPool: Amount must be non-zero",
        )
      })

      it("reverts when not enough mUSD", async () => {
        await expect(
          PCVDeployer.depositToStabilityPool(bootstrapLoan + 1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })

      it("reverts when caller is not owner/council/treasury", async () => {
        await expect(
          contracts.pcv.connect(alice.wallet).depositToStabilityPool(0),
        ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
      })
    })
  })

  describe("withdrawFromStabilityPool(),", () => {
    async function checkSuccessfulStabilityPoolWithdrawal(
      withdrawAmount: bigint,
      user: User,
      initialStabilityPoolwithBTC: boolean,
    ) {
      if (initialStabilityPoolwithBTC) {
        // setup StabilityPool to have BTC in it via a liquidation
        const whaleMusd = "300,000"
        await openTrove(contracts, {
          musdAmount: whaleMusd,
          ICR: "200",
          sender: whale.wallet,
        })
        await createLiquidationEvent(contracts, deployer)
      }

      // check state assumptions before
      await updatePCVSnapshot(contracts, state, "before")
      if (initialStabilityPoolwithBTC === true) {
        expect(state.pcv.musd.before).to.be.greaterThan(0n) // fees from opening the whale trove + defaulter trove
      } else {
        expect(state.pcv.musd.before).to.equal(0n)
      }
      expect(state.pcv.collateral.before).to.equal(0n)

      await updateStabilityPoolSnapshot(contracts, state, "before")
      if (initialStabilityPoolwithBTC === true) {
        expect(state.stabilityPool.collateral.before).to.be.greaterThan(0n) // BTC from the liquidadtion
      } else {
        expect(state.stabilityPool.collateral.before).to.equal(0n)
      }
      expect(state.stabilityPool.musd.before).to.be.greaterThan(0n)

      // call to test
      const tx = await contracts.pcv
        .connect(user.wallet)
        .withdrawFromStabilityPool(withdrawAmount)

      // check state assumptions after
      await updatePCVSnapshot(contracts, state, "after")
      expect(state.pcv.musd.after).to.equal(
        state.pcv.musd.before + withdrawAmount,
      )
      expect(state.pcv.collateral.after).to.equal(
        state.stabilityPool.collateral.before,
      )

      await updateStabilityPoolSnapshot(contracts, state, "after")
      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before - withdrawAmount,
      )
      expect(state.stabilityPool.collateral.after).to.equal(0n)

      // check emitted event data
      const { musdAmount, collateralAmount } =
        await getEmittedSPtoPCVWithdrawalValues(tx)
      expect(withdrawAmount).to.equal(musdAmount)
      expect(collateralAmount).to.equal(state.pcv.collateral.after)
    }

    it("has no BTC balance changes if BTC only withdrawal request and stability pool has no BTC", async () => {
      const withdrawAmount = 0n
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        deployer,
        false,
      )
    })

    it("has no BTC balance changes with mUSD withdrawal request and stability pool has no BTC", async () => {
      const withdrawAmount = to1e18(1)
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        deployer,
        false,
      )
    })

    it("owner can withdraw BTC collateral from StabilityPool to PCV if no mUSD amount is requested", async () => {
      const withdrawAmount = 0n
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        deployer,
        true,
      )
    })

    it("owner can withdraw BTC and mUSD from StabilityPool to PCV", async () => {
      const withdrawAmount = to1e18(1)
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        deployer,
        true,
      )
    })

    it("treasury can withdraw BTC and mUSD from StabilityPool to PCV", async () => {
      const withdrawAmount = to1e18(1)
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        treasury,
        true,
      )
    })

    it("treasury can withdraw BTC collateral from StabilityPool to PCV if no mUSD amount is requested", async () => {
      const withdrawAmount = 0n
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        treasury,
        true,
      )
    })

    it("council can withdraw BTC and mUSD from StabilityPool to PCV", async () => {
      const withdrawAmount = to1e18(1)
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        council,
        true,
      )
    })

    it("council can withdraw BTC collateral from StabilityPool to PCV if no mUSD amount is requested", async () => {
      const withdrawAmount = 0n
      await checkSuccessfulStabilityPoolWithdrawal(
        withdrawAmount,
        council,
        true,
      )
    })

    it("return entire balance if requested amount is greater than the balance", async () => {
      const withdrawAmount = bootstrapLoan * 2n
      const roundingError = 100000000n // Rounding error that occurs when there is only one depositor into the StabilityPool withdrawing everything after a liquidation has been taken

      // setup StabilityPool to have BTC in it
      const whaleMusd = "300,000"
      await openTrove(contracts, {
        musdAmount: whaleMusd,
        ICR: "200",
        sender: whale.wallet,
      })
      await createLiquidationEvent(contracts, deployer)

      // initial state assertions
      await updatePCVSnapshot(contracts, state, "before")
      expect(state.pcv.collateral.before).to.equal(0n)
      expect(state.pcv.musd.before).to.be.greaterThan(0n)

      await updateStabilityPoolSnapshot(contracts, state, "before")
      expect(state.stabilityPool.collateral.before).to.be.greaterThan(0n)
      expect(state.stabilityPool.musd.before).to.be.greaterThan(0n)

      const tx = await contracts.pcv
        .connect(deployer.wallet)
        .withdrawFromStabilityPool(withdrawAmount)

      // check results
      await updatePCVSnapshot(contracts, state, "after")
      expect(state.pcv.musd.after).to.equal(
        state.pcv.musd.before + state.stabilityPool.musd.before - roundingError,
      )
      expect(state.pcv.collateral.after).to.equal(
        state.stabilityPool.collateral.before,
      )

      await updateStabilityPoolSnapshot(contracts, state, "after")
      expect(state.stabilityPool.musd.after).to.equal(roundingError)
      expect(state.stabilityPool.collateral.after).to.equal(0n)

      // check event
      const { musdAmount, collateralAmount } =
        await getEmittedSPtoPCVWithdrawalValues(tx)
      expect(musdAmount).to.equal(
        state.stabilityPool.musd.before - roundingError,
      )
      expect(collateralAmount).to.equal(state.pcv.collateral.after)
    })

    it("return entire balance if requested amount is greater than the balance and there have been no liquidations", async () => {
      const withdrawAmount = bootstrapLoan * 2n

      // initial state assertions
      await updatePCVSnapshot(contracts, state, "before")
      expect(state.pcv.collateral.before).to.equal(0n)
      expect(state.pcv.musd.before).to.equal(0n)
      await updateStabilityPoolSnapshot(contracts, state, "before")
      expect(state.stabilityPool.collateral.before).to.equal(0n)
      expect(state.stabilityPool.musd.before).to.equal(bootstrapLoan)

      const tx = await contracts.pcv
        .connect(deployer.wallet)
        .withdrawFromStabilityPool(withdrawAmount)

      // check results
      await updatePCVSnapshot(contracts, state, "after")
      expect(state.pcv.musd.after).to.equal(
        state.pcv.musd.before + state.stabilityPool.musd.before,
      )
      expect(state.pcv.collateral.after).to.equal(
        state.stabilityPool.collateral.before,
      )
      await updateStabilityPoolSnapshot(contracts, state, "after")
      expect(state.stabilityPool.musd.after).to.equal(0n)
      expect(state.stabilityPool.collateral.after).to.equal(0n)

      // check event
      const { musdAmount, collateralAmount } =
        await getEmittedSPtoPCVWithdrawalValues(tx)
      expect(musdAmount).to.equal(state.stabilityPool.musd.before)
      expect(collateralAmount).to.equal(state.pcv.collateral.after)
    })

    context("Expected Reverts", () => {
      it("reverts when caller is not owner/council/treasury", async () => {
        await expect(
          contracts.pcv.connect(alice.wallet).withdrawFromStabilityPool(0),
        ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
      })
    })
  })

  describe("withdrawMUSD() from PCV", () => {
    it("withdraws mUSD to recipient when the loan is paid", async () => {
      await debtPaid()
      const value = to1e18("20")
      await contracts.musd.unprotectedMint(addresses.pcv, value)
      await contracts.pcv
        .connect(treasury.wallet)
        .withdrawMUSD(alice.address, value)
      expect(await contracts.musd.balanceOf(alice.address)).to.equal(value)
      expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
    })

    it("withdraws mUSD to recipient after recipient is added to the whitelist when the loan is paid", async () => {
      await debtPaid()
      const value = to1e18("20")
      await contracts.musd.unprotectedMint(addresses.pcv, value)

      await expect(
        PCVDeployer.withdrawMUSD(bob.address, value),
      ).to.be.revertedWith("PCV: recipient must be in whitelist")

      // add bob as the recipient
      await PCVDeployer.addRecipientToWhitelist(addresses.bob)

      await PCVDeployer.withdrawMUSD(alice.address, value)
      expect(await contracts.musd.balanceOf(alice.address)).to.equal(value)
      expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
    })

    context("Expected Reverts", () => {
      it("reverts when debt is not paid", async () => {
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawMUSD(alice.address, 1n),
        ).to.be.revertedWith("PCV: debt must be paid")
      })

      it("reverts if recipient is not in whitelist", async () => {
        await debtPaid()
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawMUSD(bob.address, bootstrapLoan),
        ).to.be.revertedWith("PCV: recipient must be in whitelist")
      })

      it("reverts if not enough mUSD", async () => {
        await debtPaid()
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawMUSD(alice.address, bootstrapLoan + 1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })
    })
  })

  describe("distributeMUSD()", () => {})

  describe("distributeMUSD()", () => {
    describe("active protocol bootstrap loan", () => {
      it("uses all fees to pay down the debt if feeRecipient is not set", async () => {
        const value = bootstrapLoan / 3n
        await contracts.musd.unprotectedMint(addresses.pcv, value)
        await contracts.pcv.connect(treasury.wallet).distributeMUSD(value)
        const debtToPay = await contracts.pcv.debtToPay()
        expect(debtToPay).to.equal(bootstrapLoan - value)
        expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
      })

      it("uses all fees to pay down the debt if feeSplitPercentage is 0, even if the feeRecipient is set", async () => {
        await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
        await contracts.pcv.connect(council.wallet).setFeeSplit(0n)

        await updateWalletSnapshot(contracts, bob, "before")

        const value = to1e18("1000")
        await contracts.musd.unprotectedMint(addresses.pcv, value)
        await contracts.pcv.connect(treasury.wallet).distributeMUSD(value)

        await updateWalletSnapshot(contracts, bob, "after")

        const debtToPay = await contracts.pcv.debtToPay()
        expect(debtToPay).to.equal(bootstrapLoan - value)

        expect(bob.musd.after).to.equal(bob.musd.before)
      })

      it("sends the specified percentage to another recipient and uses the rest to pay the debt", async () => {
        const split = 50n
        await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
        await contracts.pcv.connect(council.wallet).setFeeSplit(split)

        await updateWalletSnapshot(contracts, bob, "before")

        const value = to1e18("1000")
        await contracts.musd.unprotectedMint(addresses.pcv, value)
        await contracts.pcv.connect(treasury.wallet).distributeMUSD(value)

        await updateWalletSnapshot(contracts, bob, "after")

        const pcvSplit = (value * (100n - split)) / 100n
        const debtToPay = await contracts.pcv.debtToPay()
        expect(debtToPay).to.equal(bootstrapLoan - pcvSplit)

        expect(bob.musd.after - bob.musd.before).to.equal(value - pcvSplit)
      })

      it("sends remaining fees to the StabilityPool if called with a value greater than the debt", async () => {
        // pay down all but 5 musd of the debt
        const debtToPay = await contracts.pcv.debtToPay()
        const debtToLeaveRemaining = to1e18("5")
        const value = debtToPay - debtToLeaveRemaining
        await contracts.musd.unprotectedMint(addresses.pcv, value)
        await contracts.pcv.connect(treasury.wallet).distributeMUSD(value)

        await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
        await contracts.pcv.connect(council.wallet).setFeeSplit(50n)
        await updateWalletSnapshot(contracts, bob, "before")
        await updateStabilityPoolSnapshot(contracts, state, "before")

        await contracts.musd.unprotectedMint(addresses.pcv, to1e18("20"))
        await contracts.pcv
          .connect(treasury.wallet)
          .distributeMUSD(to1e18("20"))
        await updateWalletSnapshot(contracts, bob, "after")
        await updateStabilityPoolSnapshot(contracts, state, "after")

        expect(bob.musd.after - bob.musd.before).to.equal(to1e18("10"))
        expect(state.stabilityPool.musd.after).to.equal(
          state.stabilityPool.musd.before + to1e18("5"),
        )
      })

      it("rounding errors in fee splitting favor the debt", async () => {
        await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
        await contracts.pcv.connect(council.wallet).setFeeSplit(1n)

        await updateWalletSnapshot(contracts, bob, "before")

        const value = 1n
        await contracts.musd.unprotectedMint(addresses.pcv, value)
        await contracts.pcv.connect(treasury.wallet).distributeMUSD(value)

        await updateWalletSnapshot(contracts, bob, "after")

        // With only 1 unit of debt to split, all the fee goes to the debt
        const debtToPay = await contracts.pcv.debtToPay()
        expect(debtToPay).to.equal(bootstrapLoan - value)

        // Bob's musd balance should be unchanged as he receives none of the fee
        expect(bob.musd.after).to.equal(bob.musd.before)
      })
    })

    describe("repaid protocol bootstrap loan", () => {
      it("sends all fees to the StabilityPool if the debt is repaid and no recipient is set", async () => {
        // paydown the bootstrap loan
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await contracts.pcv
          .connect(treasury.wallet)
          .distributeMUSD(bootstrapLoan)

        // simulate fees
        const protocolFees = to1e18("10")
        await contracts.musd.unprotectedMint(addresses.pcv, protocolFees)

        await updateStabilityPoolSnapshot(contracts, state, "before")
        // trigger fee distribution
        await contracts.pcv
          .connect(treasury.wallet)
          .distributeMUSD(protocolFees)
        await updateStabilityPoolSnapshot(contracts, state, "after")

        expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
        expect(state.stabilityPool.musd.after).to.equal(
          state.stabilityPool.musd.before + protocolFees,
        )
      })

      it("sends all fees to the StabilityPool if feeSplitPercentage is 0, even if the feeRecipient is set", async () => {
        await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
        await contracts.pcv.connect(council.wallet).setFeeSplit(0n)

        // paydown the bootstrap loan
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await contracts.pcv
          .connect(treasury.wallet)
          .distributeMUSD(bootstrapLoan)

        // simulate fees
        const protocolFees = to1e18("10")
        await contracts.musd.unprotectedMint(addresses.pcv, protocolFees)

        await updateStabilityPoolSnapshot(contracts, state, "before")
        // trigger fee distribution
        await contracts.pcv
          .connect(treasury.wallet)
          .distributeMUSD(protocolFees)
        await updateStabilityPoolSnapshot(contracts, state, "after")

        expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
        expect(state.stabilityPool.musd.after).to.equal(
          state.stabilityPool.musd.before + protocolFees,
        )
      })

      it("sends the specified percentage to another recipient and deposits the rest in the StabilityPool", async () => {
        // paydown the bootstrap loan
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await contracts.pcv
          .connect(treasury.wallet)
          .distributeMUSD(bootstrapLoan)

        // set recipient and split
        const feeSplit = 20n
        await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
        await contracts.pcv.connect(council.wallet).setFeeSplit(feeSplit)
        await updateWalletSnapshot(contracts, bob, "before")

        // simulate fees
        const protocolFees = to1e18("10")
        await contracts.musd.unprotectedMint(addresses.pcv, protocolFees)

        await updateStabilityPoolSnapshot(contracts, state, "before")
        // trigger fee distribution
        await contracts.pcv
          .connect(treasury.wallet)
          .distributeMUSD(protocolFees)
        await updateStabilityPoolSnapshot(contracts, state, "after")
        await updateWalletSnapshot(contracts, bob, "after")

        expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
        expect(state.stabilityPool.musd.after).to.equal(
          state.stabilityPool.musd.before +
            (protocolFees * (100n - feeSplit)) / 100n,
        )
        expect(bob.musd.after).to.equal(
          bob.musd.before + (protocolFees * feeSplit) / 100n,
        )
      })
    })

    context("Expected Reverts", () => {
      it("reverts when not enough tokens to burn", async () => {
        await expect(
          contracts.pcv.connect(council.wallet).distributeMUSD(1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })
    })
  })

  describe("addRecipientToWhitelist() / addRecipientsToWhitelist()", () => {
    it("adds new recipient to the whitelist", async () => {
      await PCVDeployer.addRecipientToWhitelist(bob.address)
      expect(await contracts.pcv.recipientsWhitelist(bob.address)).to.equal(
        true,
      )
    })

    it("adds new recipients to the whitelist", async () => {
      await PCVDeployer.addRecipientsToWhitelist([
        bob.address,
        deployer.address,
      ])
      expect(await contracts.pcv.recipientsWhitelist(bob.address)).to.equal(
        true,
      )
      expect(
        await contracts.pcv.recipientsWhitelist(deployer.address),
      ).to.equal(true)
    })

    context("Expected Reverts", () => {
      it("reverts when address is already in the whitelist", async () => {
        await expect(
          PCVDeployer.addRecipientToWhitelist(alice.address),
        ).to.be.revertedWith(
          "PCV: Recipient has already been added to whitelist",
        )
      })

      it("reverts when address is already in the whitelist", async () => {
        await expect(
          PCVDeployer.addRecipientsToWhitelist([alice.address, bob.address]),
        ).to.be.revertedWith(
          "PCV: Recipient has already been added to whitelist",
        )
      })
    })
  })

  describe("removeRecipientFromWhitelist() / removeRecipientsFromWhitelist()", () => {
    it("removes recipient from the whitelist", async () => {
      await PCVDeployer.removeRecipientFromWhitelist(alice.address)
      expect(await contracts.pcv.recipientsWhitelist(alice.address)).to.equal(
        false,
      )
    })

    it("removes recipients from the whitelist", async () => {
      await PCVDeployer.removeRecipientsFromWhitelist([
        alice.address,
        council.address,
      ])
      expect(await contracts.pcv.recipientsWhitelist(alice.address)).to.equal(
        false,
      )
      expect(await contracts.pcv.recipientsWhitelist(council.address)).to.equal(
        false,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when address is not in the whitelist", async () => {
        await expect(
          PCVDeployer.removeRecipientFromWhitelist(bob.address),
        ).to.be.revertedWith("PCV: Recipient is not in whitelist")
      })

      it("reverts when address is not in the whitelist", async () => {
        await expect(
          PCVDeployer.removeRecipientsFromWhitelist([
            alice.address,
            bob.address,
          ]),
        ).to.be.revertedWith("PCV: Recipient is not in whitelist")
      })
    })
  })

  describe("withdrawCollateral()", () => {
    it("withdraws BTC to recipient when there is a protocol loan", async () => {
      const value = to1e18("20")
      await updateWalletSnapshot(contracts, alice, "before")
      // Send BTC to PCV
      await deployer.wallet.sendTransaction({
        to: addresses.pcv,
        value,
      })
      await contracts.pcv
        .connect(council.wallet)
        .withdrawCollateral(alice.address, value)
      await updateWalletSnapshot(contracts, alice, "after")
      expect(await ethers.provider.getBalance(addresses.pcv)).to.equal(0n)
      expect(alice.btc.after - alice.btc.before).to.equal(value)
    })

    it("withdraws BTC to recipient when the protocol loan is repaid", async () => {
      await debtPaid()
      const value = to1e18("20")
      await updateWalletSnapshot(contracts, alice, "before")
      // Send BTC to PCV
      await deployer.wallet.sendTransaction({
        to: addresses.pcv,
        value,
      })
      await contracts.pcv
        .connect(council.wallet)
        .withdrawCollateral(alice.address, value)
      await updateWalletSnapshot(contracts, alice, "after")
      expect(await ethers.provider.getBalance(addresses.pcv)).to.equal(0n)
      expect(alice.btc.after - alice.btc.before).to.equal(value)
    })

    it("withdraws BTC to recipient after recipient is added to the whitelist", async () => {
      const value = to1e18("20")
      // Send BTC to PCV
      await deployer.wallet.sendTransaction({
        to: addresses.pcv,
        value,
      })
      const withdrawAmount = to1e18("1")
      // make sure funds cant be withdrawn to bob
      await expect(
        PCVDeployer.withdrawCollateral(bob.address, withdrawAmount),
      ).to.be.revertedWith("PCV: recipient must be in whitelist")

      // add bob as the recipient
      await PCVDeployer.addRecipientToWhitelist(addresses.bob)
      await updateWalletSnapshot(contracts, bob, "before")

      // withdraw collatearl
      await PCVDeployer.withdrawCollateral(bob.address, withdrawAmount)

      await updateWalletSnapshot(contracts, bob, "after")

      // check he got them
      expect(bob.btc.after).to.equal(bob.btc.before + withdrawAmount)
    })

    it("emits correct values on withdrawing collateral from PCV", async () => {
      const value = to1e18("20")
      await updateWalletSnapshot(contracts, alice, "before")
      // Send BTC to PCV
      await deployer.wallet.sendTransaction({
        to: addresses.pcv,
        value,
      })
      const tx = await contracts.pcv
        .connect(council.wallet)
        .withdrawCollateral(alice.address, value)

      const { recipient, collateralAmount } =
        await getEmittedWithdrawCollateralValues(tx)
      expect(recipient).to.equal(alice.address)
      expect(collateralAmount).to.equal(value)
    })

    context("Expected Reverts", () => {
      it("reverts if recipient is not in whitelist", async () => {
        await debtPaid()
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawCollateral(bob.address, bootstrapLoan),
        ).to.be.revertedWith("PCV: recipient must be in whitelist")
      })

      it("reverts if not enough collateral", async () => {
        await debtPaid()
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawCollateral(alice.address, 1n),
        ).to.be.revertedWith("Sending BTC failed")
      })

      it("reverts when caller is not owner/council/treasury", async () => {
        await expect(
          contracts.pcv
            .connect(alice.wallet)
            .withdrawCollateral(alice.address, 1n),
        ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
      })
    })
  })

  describe("setFeeSplit()", () => {
    it("sets fee split if percentage is less than max and there is debt", async () => {
      await PCVDeployer.setFeeRecipient(bob.address)
      await PCVDeployer.setFeeSplit(2n)
      expect(await PCVDeployer.feeSplitPercentage()).to.equal(2n)
    })

    it("sets fee split greater than 50% if the debt is paid", async () => {
      await debtPaid()
      await PCVDeployer.setFeeRecipient(bob.address)
      await PCVDeployer.setFeeSplit(51n)
      expect(await PCVDeployer.feeSplitPercentage()).to.equal(51n)
    })

    context("Expected Reverts", () => {
      it("reverts if fee split is > 50% before debt is paid", async () => {
        await PCVDeployer.setFeeRecipient(bob.address)
        await expect(PCVDeployer.setFeeSplit(51n)).to.be.revertedWith(
          "PCV: Fee split must be at most 50 while debt remains.",
        )
      })
      it("reverts when caller is not owner/council/treasury", async () => {
        await expect(
          contracts.pcv.connect(alice.wallet).setFeeSplit(50n),
        ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
      })
    })
  })

  describe("setFeeRecipient()", () => {
    context("Expected Reverts", () => {
      it("reverts if the fee recipient is the zero address", async () => {
        await expect(
          PCVDeployer.setFeeRecipient(ZERO_ADDRESS),
        ).to.be.revertedWith("PCV: Fee recipient cannot be the zero address.")
      })
      it("reverts when caller is not owner/council/treasury", async () => {
        await expect(
          contracts.pcv.connect(alice.wallet).setFeeRecipient(addresses.alice),
        ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
      })
    })
  })

  describe("Rebalancing", () => {
    it("treasury can withdraw BTC to swap and redeposit mUSD into StabilityPool", async () => {
      // setup StabilityPool to have BTC in it via a liquidation
      const whaleMusd = "300,000"
      await openTrove(contracts, {
        musdAmount: whaleMusd,
        ICR: "200",
        sender: whale.wallet,
      })
      await createLiquidationEvent(contracts, deployer)

      let pcvBalance = await ethers.provider.getBalance(addresses.pcv)
      expect(pcvBalance).to.equal(0n)

      // check state assumptions before
      await updateWalletSnapshot(contracts, treasury, "before")
      await updatePCVSnapshot(contracts, state, "before")
      await updateStabilityPoolSnapshot(contracts, state, "before")
      const liquidatedBTC = state.stabilityPool.collateral.before

      // call to withdraw BTC from StabilityPool to PCV
      await contracts.pcv.connect(treasury.wallet).withdrawFromStabilityPool(0n)
      pcvBalance = await ethers.provider.getBalance(addresses.pcv)
      expect(pcvBalance).to.be.equal(liquidatedBTC)

      // call to withdraw BTC from PCV to treasury
      await contracts.pcv
        .connect(treasury.wallet)
        .withdrawCollateral(treasury.address, pcvBalance)
      pcvBalance = await ethers.provider.getBalance(addresses.pcv)
      expect(pcvBalance).to.equal(0n)

      const treasuryBalance = await ethers.provider.getBalance(treasury.address)
      expect(treasuryBalance).to.be.greaterThan(treasury.btc.before) // got to account for gas
      expect(treasuryBalance - liquidatedBTC).to.be.lessThan(
        treasury.btc.before,
      ) // got to account for gas

      // simulate acquiring mUSD and sending it back to PCV
      const value = to1e18("20,000")
      await contracts.musd.unprotectedMint(treasury.address, value)

      await contracts.musd
        .connect(treasury.wallet)
        .transfer(await contracts.pcv.getAddress(), value)

      // redeposit mUSD to PCV
      await contracts.pcv.connect(treasury.wallet).depositToStabilityPool(value)

      // check state assumptions after
      await updatePCVSnapshot(contracts, state, "after")
      await updateStabilityPoolSnapshot(contracts, state, "after")

      expect(state.stabilityPool.collateral.after).to.equal(0n)
      expect(state.stabilityPool.musd.after).to.equal(
        state.stabilityPool.musd.before + value,
      )
      expect(state.pcv.collateral.after).to.equal(0n)
      expect(state.pcv.musd.after).to.equal(state.pcv.musd.before) // note there are mint fees in here
    })
  })
})
