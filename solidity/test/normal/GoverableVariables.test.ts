import { expect } from "chai"
import {
  Contracts,
  User,
  fastForwardTime,
  getLatestBlockTimestamp,
  openTrove,
  performRedemption,
  setDefaultFees,
  setupTests,
  updateTroveSnapshot,
  updateWalletSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"
import { ZERO_ADDRESS } from "../../helpers/constants"
import { GovernableVariables } from "../../typechain"

describe("GovernableVariables", () => {
  // users
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let dennis: User
  let deployer: User
  let treasury: User
  let contracts: Contracts
  let MUSD_GAS_COMPENSATION: bigint

  let governableVariables: GovernableVariables
  let delay: bigint

  beforeEach(async () => {
    ;({ alice, bob, carol, council, dennis, deployer, treasury, contracts } =
      await setupTests())

    // for ease of use when calling onlyOwner* functions
    governableVariables = contracts.governableVariables.connect(deployer.wallet)

    MUSD_GAS_COMPENSATION =
      await contracts.borrowerOperations.MUSD_GAS_COMPENSATION()

    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()

    await contracts.governableVariables
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.governableVariables
      .connect(deployer.wallet)
      .finalizeChangingRoles()

    await setDefaultFees(contracts, council)

    delay = await contracts.governableVariables.governanceTimeDelay()
  })

  describe("startChangingRoles()", () => {
    it("adds new roles as pending", async () => {
      await governableVariables.startChangingRoles(alice.address, bob.address)
      expect(await contracts.governableVariables.council()).to.equal(
        council.address,
      )
      expect(await contracts.governableVariables.treasury()).to.equal(
        treasury.address,
      )
      expect(
        await contracts.governableVariables.pendingCouncilAddress(),
      ).to.equal(alice.address)
      expect(
        await contracts.governableVariables.pendingTreasuryAddress(),
      ).to.equal(bob.address)
    })

    it("speeds up first setting of roles", async () => {
      // reset roles first
      await governableVariables.startChangingRoles(ZERO_ADDRESS, ZERO_ADDRESS)
      await fastForwardTime(Number(delay))
      await governableVariables.finalizeChangingRoles()

      await governableVariables.startChangingRoles(alice.address, bob.address)
      const timeNow = await getLatestBlockTimestamp()
      expect(
        Number(await contracts.governableVariables.changingRolesInitiated()),
      ).to.equal(Number(timeNow) - Number(delay))
    })

    context("Expected Reverts", () => {
      it("reverts when trying to set same roles twice", async () => {
        await expect(
          governableVariables.startChangingRoles(
            council.address,
            treasury.address,
          ),
        ).to.be.revertedWith("GovernableVariables: these roles are already set")
      })
    })
  })

  describe("cancelChangingRoles()", () => {
    it("resets pending roles", async () => {
      await governableVariables.startChangingRoles(alice.address, bob.address)
      await governableVariables.cancelChangingRoles()
      expect(
        await contracts.governableVariables.pendingCouncilAddress(),
      ).to.equal(ZERO_ADDRESS)
      expect(
        await contracts.governableVariables.pendingTreasuryAddress(),
      ).to.equal(ZERO_ADDRESS)
      expect(await contracts.governableVariables.treasury()).to.equal(
        treasury.address,
      )
      expect(await contracts.governableVariables.council()).to.equal(
        council.address,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when changing is not initiated", async () => {
        await expect(
          governableVariables.cancelChangingRoles(),
        ).to.be.revertedWith("GovernableVariables: Change not initiated")
      })
    })
  })

  describe("finalizeChangingRoles()", () => {
    it("sets new roles", async () => {
      await governableVariables.startChangingRoles(alice.address, bob.address)
      await fastForwardTime(Number(delay))
      await governableVariables.finalizeChangingRoles()
      expect(await contracts.governableVariables.council()).to.equal(
        alice.address,
      )
      expect(await contracts.governableVariables.treasury()).to.equal(
        bob.address,
      )
      expect(
        await contracts.governableVariables.pendingCouncilAddress(),
      ).to.equal(ZERO_ADDRESS)
      expect(
        await contracts.governableVariables.pendingTreasuryAddress(),
      ).to.equal(ZERO_ADDRESS)
    })

    context("Expected Reverts", () => {
      it("reverts when changing is not initiated", async () => {
        await expect(
          governableVariables.finalizeChangingRoles(),
        ).to.be.revertedWith("GovernableVariables: Change not initiated")
      })

      it("reverts when not enough time has passed", async () => {
        await governableVariables.startChangingRoles(alice.address, bob.address)
        await expect(
          governableVariables.finalizeChangingRoles(),
        ).to.be.revertedWith(
          "GovernableVariables: Governance delay has not elapsed",
        )
      })
    })
  })

  describe("addFeeExemptAccount()", () => {
    it("adds an account to the exempt list", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccount(alice.wallet)
      expect(
        await contracts.governableVariables.feeExemptAccounts(alice.wallet),
      ).to.equal(true)

      expect(
        await contracts.governableVariables.feeExemptAccounts(bob.wallet),
      ).to.equal(false)
    })

    it("makes an account exempt from borrowing fees", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccount(dennis.wallet)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      const musdAmount = to1e18("10,000")

      await openTrove(contracts, {
        sender: dennis.wallet,
        musdAmount,
        ICR: "200",
      })

      await updateTroveSnapshot(contracts, dennis, "after")

      expect(dennis.trove.debt.after).to.equal(
        musdAmount + MUSD_GAS_COMPENSATION,
      )
    })

    it("makes an account exempt from refinancing fees", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccount(dennis.wallet)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      const musdAmount = to1e18("10,000")

      await openTrove(contracts, {
        sender: dennis.wallet,
        musdAmount,
        ICR: "200",
      })

      await updateTroveSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperations
        .connect(dennis.wallet)
        .refinance(ZERO_ADDRESS, ZERO_ADDRESS)

      await updateTroveSnapshot(contracts, dennis, "after")

      expect(dennis.trove.debt.after).to.equal(dennis.trove.debt.before)
    })

    it("makes an account exempt from redemption fees", async () => {
      await openTrove(contracts, {
        musdAmount: "10,000",
        sender: alice.wallet,
        ICR: "150",
      })
      await openTrove(contracts, {
        musdAmount: "20,000",
        sender: bob.wallet,
        ICR: "150",
      })

      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccount(bob.wallet)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      await updateWalletSnapshot(contracts, bob, "before")

      const amount = to1e18(100)
      await performRedemption(contracts, bob, alice, amount)

      await updateWalletSnapshot(contracts, bob, "after")

      const price = await contracts.priceFeed.fetchPrice()

      const expectedBTCGain = (amount * to1e18(1)) / price

      expect(bob.btc.after).to.equal(bob.btc.before + expectedBTCGain)
    })

    context("Expected Reverts", () => {
      it("reverts when called by non-governance", async () => {
        await expect(
          contracts.governableVariables
            .connect(alice.wallet)
            .addFeeExemptAccount(alice.wallet),
        ).to.be.revertedWith(
          "GovernableVariables: Only governance can call this function",
        )
      })

      it("reverts when adding an already exempt address", async () => {
        await contracts.governableVariables
          .connect(council.wallet)
          .addFeeExemptAccount(alice.wallet)

        await expect(
          contracts.governableVariables
            .connect(council.wallet)
            .addFeeExemptAccount(alice.wallet),
        ).to.be.revertedWith(
          "GovernableVariables: Account must not already be exempt.",
        )
      })
    })
  })

  describe("addFeeExemptAccounts()", () => {
    it("adds accounts to the exempt list", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccounts([alice.wallet, bob.wallet])
      expect(
        await contracts.governableVariables.feeExemptAccounts(alice.wallet),
      ).to.equal(true)
      expect(
        await contracts.governableVariables.feeExemptAccounts(bob.wallet),
      ).to.equal(true)
      expect(
        await contracts.governableVariables.feeExemptAccounts(carol.wallet),
      ).to.equal(false)
    })

    it("makes an account exempt from borrowing fees", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccounts([dennis.wallet])

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      const musdAmount = to1e18("10,000")

      await openTrove(contracts, {
        sender: dennis.wallet,
        musdAmount,
        ICR: "200",
      })

      await updateTroveSnapshot(contracts, dennis, "after")

      expect(dennis.trove.debt.after).to.equal(
        musdAmount + MUSD_GAS_COMPENSATION,
      )
    })

    it("makes accounts exempt from redemption fees", async () => {
      await openTrove(contracts, {
        musdAmount: "10,000",
        sender: alice.wallet,
        ICR: "150",
      })
      await openTrove(contracts, {
        musdAmount: "20,000",
        sender: bob.wallet,
        ICR: "150",
      })

      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccounts([bob.wallet])

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      await updateWalletSnapshot(contracts, bob, "before")

      const amount = to1e18(100)
      await performRedemption(contracts, bob, alice, amount)

      await updateWalletSnapshot(contracts, bob, "after")

      const price = await contracts.priceFeed.fetchPrice()

      const expectedBTCGain = (amount * to1e18(1)) / price

      expect(bob.btc.after).to.equal(bob.btc.before + expectedBTCGain)
    })

    it("makes accounts exempt from refinancing fees", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccounts([dennis.wallet])

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      const musdAmount = to1e18("10,000")

      await openTrove(contracts, {
        sender: dennis.wallet,
        musdAmount,
        ICR: "200",
      })

      await updateTroveSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperations
        .connect(dennis.wallet)
        .refinance(ZERO_ADDRESS, ZERO_ADDRESS)

      await updateTroveSnapshot(contracts, dennis, "after")

      expect(dennis.trove.debt.after).to.equal(dennis.trove.debt.before)
    })

    context("Expected Reverts", () => {
      it("reverts when called by non-governance", async () => {
        await expect(
          contracts.governableVariables
            .connect(alice.wallet)
            .addFeeExemptAccounts([alice.wallet]),
        ).to.be.revertedWith(
          "GovernableVariables: Only governance can call this function",
        )
      })

      it("reverts when adding an already exempt address", async () => {
        await contracts.governableVariables
          .connect(council.wallet)
          .addFeeExemptAccounts([alice.wallet])

        await expect(
          contracts.governableVariables
            .connect(council.wallet)
            .addFeeExemptAccounts([alice.wallet]),
        ).to.be.revertedWith(
          "GovernableVariables: Account must not already be exempt.",
        )
      })

      it("reverts when adding an empty list", async () => {
        await expect(
          contracts.governableVariables
            .connect(council.wallet)
            .addFeeExemptAccounts([]),
        ).to.be.revertedWith(
          "GovernableVariables: Fee Exempt array must not be empty.",
        )
      })
    })
  })

  describe("removeFeeExemptAccount()", () => {
    it("removes an account from the exempt list", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccount(alice.wallet)

      expect(
        await contracts.governableVariables.feeExemptAccounts(alice.wallet),
      ).to.equal(true)

      await contracts.governableVariables
        .connect(council.wallet)
        .removeFeeExemptAccount(alice.wallet)

      expect(
        await contracts.governableVariables.feeExemptAccounts(alice.wallet),
      ).to.equal(false)
    })

    it("makes an account no longer exempt from borrowing fees", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccount(dennis.wallet)

      await contracts.governableVariables
        .connect(council.wallet)
        .removeFeeExemptAccount(dennis.wallet)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      const musdAmount = to1e18("10,000")
      const borrowingFee =
        await contracts.borrowerOperations.getBorrowingFee(musdAmount)

      await openTrove(contracts, {
        sender: dennis.wallet,
        musdAmount,
        ICR: "200",
      })

      await updateTroveSnapshot(contracts, dennis, "after")

      expect(dennis.trove.debt.after).to.equal(
        musdAmount + borrowingFee + MUSD_GAS_COMPENSATION,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when called by non-governance", async () => {
        await expect(
          contracts.governableVariables
            .connect(alice.wallet)
            .addFeeExemptAccounts([alice.wallet]),
        ).to.be.revertedWith(
          "GovernableVariables: Only governance can call this function",
        )
      })

      it("reverts when adding an already exempt address", async () => {
        await contracts.governableVariables
          .connect(council.wallet)
          .addFeeExemptAccounts([alice.wallet])

        await expect(
          contracts.governableVariables
            .connect(council.wallet)
            .addFeeExemptAccounts([alice.wallet]),
        ).to.be.revertedWith(
          "GovernableVariables: Account must not already be exempt.",
        )
      })

      it("reverts when adding an empty list", async () => {
        await expect(
          contracts.governableVariables
            .connect(council.wallet)
            .addFeeExemptAccounts([]),
        ).to.be.revertedWith(
          "GovernableVariables: Fee Exempt array must not be empty.",
        )
      })
    })
  })

  describe("removeFeeExemptAccounts()", () => {
    it("removes accounts from the exempt list", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccounts([alice.wallet, bob.wallet, carol.wallet])

      await contracts.governableVariables
        .connect(council.wallet)
        .removeFeeExemptAccounts([alice.wallet, bob.wallet])
      expect(
        await contracts.governableVariables.feeExemptAccounts(alice.wallet),
      ).to.equal(false)
      expect(
        await contracts.governableVariables.feeExemptAccounts(bob.wallet),
      ).to.equal(false)
      expect(
        await contracts.governableVariables.feeExemptAccounts(carol.wallet),
      ).to.equal(true)
    })

    it("makes an account no longer exempt from borrowing fees", async () => {
      await contracts.governableVariables
        .connect(council.wallet)
        .addFeeExemptAccounts([dennis.wallet])

      await contracts.governableVariables
        .connect(council.wallet)
        .removeFeeExemptAccounts([dennis.wallet])

      await contracts.borrowerOperations
        .connect(council.wallet)
        .proposeBorrowingRate((to1e18(1) * 50n) / 10000n)

      const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
      await fastForwardTime(timeToIncrease)

      await contracts.borrowerOperations
        .connect(council.wallet)
        .approveBorrowingRate()

      const musdAmount = to1e18("10,000")
      const borrowingFee =
        await contracts.borrowerOperations.getBorrowingFee(musdAmount)

      await openTrove(contracts, {
        sender: dennis.wallet,
        musdAmount,
        ICR: "200",
      })

      await updateTroveSnapshot(contracts, dennis, "after")

      expect(dennis.trove.debt.after).to.equal(
        musdAmount + borrowingFee + MUSD_GAS_COMPENSATION,
      )
    })

    context("Expected Reverts", () => {
      it("reverts when called by non-governance", async () => {
        await expect(
          contracts.governableVariables
            .connect(alice.wallet)
            .addFeeExemptAccounts([alice.wallet]),
        ).to.be.revertedWith(
          "GovernableVariables: Only governance can call this function",
        )
      })

      it("reverts when adding an already exempt address", async () => {
        await contracts.governableVariables
          .connect(council.wallet)
          .addFeeExemptAccounts([alice.wallet])

        await expect(
          contracts.governableVariables
            .connect(council.wallet)
            .addFeeExemptAccounts([alice.wallet]),
        ).to.be.revertedWith(
          "GovernableVariables: Account must not already be exempt.",
        )
      })

      it("reverts when adding an empty list", async () => {
        await expect(
          contracts.governableVariables
            .connect(council.wallet)
            .addFeeExemptAccounts([]),
        ).to.be.revertedWith(
          "GovernableVariables: Fee Exempt array must not be empty.",
        )
      })
    })
  })
})
