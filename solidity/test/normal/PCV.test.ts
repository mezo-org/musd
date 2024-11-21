import { expect } from "chai"
import { ethers } from "hardhat"
import {
  Contracts,
  TestingAddresses,
  User,
  fastForwardTime,
  getLatestBlockTimestamp,
  setupTests,
  updateWalletSnapshot,
} from "../helpers"
import { to1e18, ZERO_ADDRESS } from "../utils"
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
    it("pays some value of debt", async () => {
      const value = bootstrapLoan / 3n
      await contracts.musd.unprotectedMint(addresses.pcv, value)
      await contracts.pcv.connect(treasury.wallet).payDebt(value)
      const debtToPay = await contracts.pcv.debtToPay()
      expect(debtToPay).to.equal(bootstrapLoan - value)
      expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
    })

    context("Expected Reverts", () => {
      it("reverts when not enough tokens to burn", async () => {
        await expect(
          contracts.pcv.connect(council.wallet).payDebt(1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })

      it("reverts when trying to pay again", async () => {
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
    })
  })

  describe("setFeeSplit()", () => {
    context("Expected Reverts", () => {
      it("reverts if fee split is > 100", async () => {
        await expect(PCVDeployer.setFeeSplit(101n)).to.be.revertedWith(
          "PCV: Invalid split percentage",
        )
      })
    })
  })
})
