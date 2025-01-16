import { expect } from "chai"
import { ethers } from "hardhat"
import {
  Contracts,
  fastForwardTime,
  getLatestBlockTimestamp,
  setupTests,
  TestingAddresses,
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
  let contracts: Contracts
  let treasury: User

  let bootstrapLoan: bigint
  let delay: bigint

  let PCVDeployer: PCV

  async function debtPaid() {
    const debtToPay = await contracts.pcv.debtToPay()
    await contracts.musd.unprotectedMint(addresses.pcv, debtToPay)
    await contracts.pcv.connect(treasury.wallet).payDebt(debtToPay)
  }

  beforeEach(async () => {
    ;({ alice, bob, council, deployer, treasury, contracts, addresses } =
      await setupTests())

    // for ease of use when calling onlyOwner* functions
    PCVDeployer = contracts.pcv.connect(deployer.wallet)

    bootstrapLoan = await contracts.pcv.BOOTSTRAP_LOAN()
    await PCVDeployer.initialize()
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

  describe("initialize()", () => {
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
        await expect(PCVDeployer.initialize()).to.be.revertedWith(
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
    it("deposits additional mUSD to StabilityPool", async () => {
      const depositAmount = to1e18("20")
      await contracts.musd.unprotectedMint(addresses.pcv, depositAmount)
      await PCVDeployer.depositToStabilityPool(depositAmount)
      const spBalance = await contracts.stabilityPool.getCompoundedMUSDDeposit(
        addresses.pcv,
      )
      expect(spBalance).to.equal(bootstrapLoan + depositAmount)
    })

    context("Expected Reverts", () => {
      it("reverts when not enough mUSD", async () => {
        await expect(
          PCVDeployer.depositToStabilityPool(bootstrapLoan + 1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })
    })
  })

  describe("withdrawMUSD()", () => {
    it("withdraws mUSD to recipient", async () => {
      await debtPaid()
      const value = to1e18("20")
      await contracts.musd.unprotectedMint(addresses.pcv, value)
      await contracts.pcv
        .connect(treasury.wallet)
        .withdrawMUSD(alice.address, value)
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

  describe("payDebt()", () => {
    it("uses all fees to pay down the debt if feeRecipient is not set", async () => {
      const value = bootstrapLoan / 3n
      await contracts.musd.unprotectedMint(addresses.pcv, value)
      await contracts.pcv.connect(treasury.wallet).payDebt(value)
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
      await contracts.pcv.connect(treasury.wallet).payDebt(value)

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
      await contracts.pcv.connect(treasury.wallet).payDebt(value)

      await updateWalletSnapshot(contracts, bob, "after")

      const pcvSplit = (value * (100n - split)) / 100n
      const debtToPay = await contracts.pcv.debtToPay()
      expect(debtToPay).to.equal(bootstrapLoan - pcvSplit)

      expect(bob.musd.after - bob.musd.before).to.equal(value - pcvSplit)
    })

    it("sends all fees to the feeRecipient if the debt is completely paid", async () => {
      await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
      await contracts.pcv.connect(council.wallet).setFeeSplit(20n)

      const debtToPay = await contracts.pcv.debtToPay()
      const amountToPay = (debtToPay * 10n) / 8n
      await contracts.musd.unprotectedMint(addresses.pcv, amountToPay)
      await contracts.pcv.connect(treasury.wallet).payDebt(amountToPay)

      await updateWalletSnapshot(contracts, bob, "before")

      await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
      await contracts.pcv.connect(treasury.wallet).payDebt(bootstrapLoan)
      await updateWalletSnapshot(contracts, bob, "after")

      expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
      expect(bob.musd.after - bob.musd.before).to.equal(bootstrapLoan)
    })

    it("sends remaining fees to the feeRecipient if called with a value greater than the debt", async () => {
      // pay down all but 5 musd of the debt
      const debtToPay = await contracts.pcv.debtToPay()
      const debtToLeaveRemaining = to1e18("5")
      const value = debtToPay - debtToLeaveRemaining
      await contracts.musd.unprotectedMint(addresses.pcv, value)
      await contracts.pcv.connect(treasury.wallet).payDebt(value)

      await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
      await contracts.pcv.connect(council.wallet).setFeeSplit(50n)
      await updateWalletSnapshot(contracts, bob, "before")

      await contracts.musd.unprotectedMint(addresses.pcv, to1e18("20"))
      await contracts.pcv.connect(treasury.wallet).payDebt(to1e18("20"))
      await updateWalletSnapshot(contracts, bob, "after")

      expect(bob.musd.after - bob.musd.before).to.equal(to1e18("15"))
    })

    it("rounding errors in fee splitting favor the debt", async () => {
      await contracts.pcv.connect(council.wallet).setFeeRecipient(bob.address)
      await contracts.pcv.connect(council.wallet).setFeeSplit(1n)

      await updateWalletSnapshot(contracts, bob, "before")

      const value = 1n
      await contracts.musd.unprotectedMint(addresses.pcv, value)
      await contracts.pcv.connect(treasury.wallet).payDebt(value)

      await updateWalletSnapshot(contracts, bob, "after")

      // With only 1 unit of debt to split, all the fee goes to the debt
      const debtToPay = await contracts.pcv.debtToPay()
      expect(debtToPay).to.equal(bootstrapLoan - value)

      // Bob's musd balance should be unchanged as he receives none of the fee
      expect(bob.musd.after).to.equal(bob.musd.before)
    })

    context("Expected Reverts", () => {
      it("reverts when not enough tokens to burn", async () => {
        await expect(
          contracts.pcv.connect(council.wallet).payDebt(1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })

      it("reverts when trying to pay again if no fee recipient is set", async () => {
        await debtPaid()
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await expect(
          contracts.pcv.connect(council.wallet).payDebt(bootstrapLoan),
        ).to.be.revertedWith("PCV: debt has already paid")
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
    it("withdraws BTC to recipient", async () => {
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

      it("reverts when debt is not paid", async () => {
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawCollateral(alice.address, 1n),
        ).to.be.revertedWith("PCV: debt must be paid")
      })
    })
  })

  describe("setFeeSplit()", () => {
    context("Expected Reverts", () => {
      it("reverts if fee split is > 50% before debt is paid", async () => {
        await expect(PCVDeployer.setFeeSplit(51n)).to.be.revertedWith(
          "PCV: Fee split must be at most 50 while debt remains.",
        )
      })
      it("reverts if the debt is paid", async () => {
        await debtPaid()
        await expect(PCVDeployer.setFeeSplit(1n)).to.be.revertedWith(
          "PCV: Must have debt in order to set a fee split.",
        )
      })
    })
  })
})
