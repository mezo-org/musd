import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"
import {
  connectContracts,
  Contracts,
  fastForwardTime,
  fixtureV2,
  getAddresses,
  getLatestBlockTimestamp,
  TestingAddresses,
  TestSetupV2,
  updateWalletSnapshot,
  User,
} from "../../helpers"
import { to1e18, ZERO_ADDRESS } from "../../utils"
import { PCV } from "../../../typechain"

describe("PCV", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let council: User
  let deployer: User
  let contracts: Contracts
  let cachedTestSetup: TestSetupV2
  let treasury: User
  let testSetup: TestSetupV2

  let bootstrapLoan: bigint
  let delay: bigint

  let PCVDeployer: PCV

  async function debtPaid() {
    const debtToPay = await contracts.pcv.debtToPay()
    await contracts.musd.unprotectedMint(addresses.pcv, debtToPay)
    await contracts.pcv.connect(treasury.wallet).payDebt(debtToPay)
  }

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixtureV2)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts

    await connectContracts(contracts, testSetup.users)
    ;({ alice, bob, council, deployer, treasury } = testSetup.users)

    // readability helper
    addresses = await getAddresses(contracts, testSetup.users)

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
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("initialize(): reverts when trying to initialize second time", async () => {
        await expect(PCVDeployer.initialize()).to.be.revertedWith(
          "PCV: already initialized",
        )
      })
    })

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
      it("initialize(): bootstrap loan deposited to SP and tracked in PCV", async () => {
        const debtToPay = await contracts.pcv.debtToPay()
        expect(debtToPay).to.equal(bootstrapLoan)

        const pcvBalance = await ethers.provider.getBalance(addresses.pcv)
        expect(pcvBalance).to.equal(0n)

        const spBalance =
          await contracts.stabilityPool.getCompoundedMUSDDeposit(addresses.pcv)
        expect(spBalance).to.equal(bootstrapLoan)
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

  describe("startChangingRoles()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("startChangingRoles(): reverts when trying to set same roles twice", async () => {
        await expect(
          PCVDeployer.startChangingRoles(council.address, treasury.address),
        ).to.be.revertedWith("PCV: these roles already set")
      })
    })

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
      it("startChangingRoles(): adds new roles as pending", async () => {
        await PCVDeployer.startChangingRoles(alice.address, bob.address)
        expect(await contracts.pcv.council()).to.equal(council.address)
        expect(await contracts.pcv.treasury()).to.equal(treasury.address)
        expect(await contracts.pcv.pendingCouncilAddress()).to.equal(
          alice.address,
        )
        expect(await contracts.pcv.pendingTreasuryAddress()).to.equal(
          bob.address,
        )
      })

      it("startChangingRoles(): speeds up first setting of roles", async () => {
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

  describe("cancelChangingRoles()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("cancelChangingRoles(): reverts when changing is not initiated", async () => {
        await expect(PCVDeployer.cancelChangingRoles()).to.be.revertedWith(
          "PCV: Change not initiated",
        )
      })
    })

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
      it("cancelChangingRoles(): resets pending roles", async () => {
        await PCVDeployer.startChangingRoles(alice.address, bob.address)
        await PCVDeployer.cancelChangingRoles()
        expect(await contracts.pcv.pendingCouncilAddress()).to.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.pcv.pendingTreasuryAddress()).to.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.pcv.treasury()).to.equal(treasury.address)
        expect(await contracts.pcv.council()).to.equal(council.address)
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

  describe("finalizeChangingRoles()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("finalizeChangingRoles(): reverts when changing is not initiated", async () => {
        await expect(PCVDeployer.finalizeChangingRoles()).to.be.revertedWith(
          "PCV: Change not initiated",
        )
      })

      it("finalizeChangingRoles(): reverts when not enough time has passed", async () => {
        await PCVDeployer.startChangingRoles(alice.address, bob.address)
        await expect(PCVDeployer.finalizeChangingRoles()).to.be.revertedWith(
          "PCV: Governance delay has not elapsed",
        )
      })
    })

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
      it("finalizeChangingRoles(): sets new roles", async () => {
        await PCVDeployer.startChangingRoles(alice.address, bob.address)
        await fastForwardTime(Number(delay))
        await PCVDeployer.finalizeChangingRoles()
        expect(await contracts.pcv.council()).to.equal(alice.address)
        expect(await contracts.pcv.treasury()).to.equal(bob.address)
        expect(await contracts.pcv.pendingCouncilAddress()).to.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.pcv.pendingTreasuryAddress()).to.equal(
          ZERO_ADDRESS,
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

  describe("depositToStabilityPool()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("depositToStabilityPool(): reverts when not enough MUSD", async () => {
        await expect(
          PCVDeployer.depositToStabilityPool(bootstrapLoan + 1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })
    })

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
      it("depositToStabilityPool(): deposits additional MUSD to StabilityPool", async () => {
        const depositAmount = to1e18("20")
        await contracts.musd.unprotectedMint(addresses.pcv, depositAmount)
        await PCVDeployer.depositToStabilityPool(depositAmount)
        const spBalance =
          await contracts.stabilityPool.getCompoundedMUSDDeposit(addresses.pcv)
        expect(spBalance).to.equal(bootstrapLoan + depositAmount)
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

  describe("withdrawMUSD()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("withdrawMUSD(): reverts when debt is not paid", async () => {
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawMUSD(alice.address, 1n),
        ).to.be.revertedWith("PCV: debt must be paid")
      })

      it("withdrawMUSD(): reverts if recipient is not in whitelist", async () => {
        await debtPaid()
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawMUSD(bob.address, bootstrapLoan),
        ).to.be.revertedWith("PCV: recipient must be in whitelist")
      })

      it("withdrawMUSD(): reverts if not enough MUSD", async () => {
        await debtPaid()
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawMUSD(alice.address, bootstrapLoan + 1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })
    })

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
      it("withdrawMUSD(): withdraws MUSD to recipient", async () => {
        await debtPaid()
        const value = to1e18("20")
        await contracts.musd.unprotectedMint(addresses.pcv, value)
        await contracts.pcv
          .connect(treasury.wallet)
          .withdrawMUSD(alice.address, value)
        expect(await contracts.musd.balanceOf(alice.address)).to.equal(value)
        expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
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

  describe("payDebt()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("payDebt(): reverts when not enough tokens to burn", async () => {
        await expect(
          contracts.pcv.connect(council.wallet).payDebt(1n),
        ).to.be.revertedWith("PCV: not enough tokens")
      })

      it("payDebt(): reverts when trying to pay again", async () => {
        await debtPaid()
        await contracts.musd.unprotectedMint(addresses.pcv, bootstrapLoan)
        await expect(
          contracts.pcv.connect(council.wallet).payDebt(bootstrapLoan),
        ).to.be.revertedWith("PCV: debt has already paid")
      })
    })

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
      it("payDebt(): pays some value of debt", async () => {
        const value = bootstrapLoan / 3n
        await contracts.musd.unprotectedMint(addresses.pcv, value)
        await contracts.pcv.connect(treasury.wallet).payDebt(value)
        const debtToPay = await contracts.pcv.debtToPay()
        expect(debtToPay).to.equal(bootstrapLoan - value)
        expect(await contracts.musd.balanceOf(addresses.pcv)).to.equal(0n)
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

  describe("addRecipientToWhitelist() / addRecipientsToWhitelist()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("addRecipientToWhitelist(): reverts when address is already in the whitelist", async () => {
        await expect(
          PCVDeployer.addRecipientToWhitelist(alice.address),
        ).to.be.revertedWith(
          "PCV: Recipient has already been added to whitelist",
        )
      })

      it("addRecipientsToWhitelist(): reverts when address is already in the whitelist", async () => {
        await expect(
          PCVDeployer.addRecipientsToWhitelist([alice.address, bob.address]),
        ).to.be.revertedWith(
          "PCV: Recipient has already been added to whitelist",
        )
      })
    })

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
      it("addRecipientToWhitelist(): adds new recipient to the whitelist", async () => {
        await PCVDeployer.addRecipientToWhitelist(bob.address)
        expect(await contracts.pcv.recipientsWhitelist(bob.address)).to.equal(
          true,
        )
      })

      it("addRecipientsToWhitelist(): adds new recipients to the whitelist", async () => {
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

  describe("removeRecipientFromWhitelist() / removeRecipientsFromWhitelist()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("removeRecipientFromWhitelist(): reverts when address is not in the whitelist", async () => {
        await expect(
          PCVDeployer.removeRecipientFromWhitelist(bob.address),
        ).to.be.revertedWith("PCV: Recipient is not in whitelist")
      })

      it("removeRecipientsFromWhitelist(): reverts when address is not in the whitelist", async () => {
        await expect(
          PCVDeployer.removeRecipientsFromWhitelist([
            alice.address,
            bob.address,
          ]),
        ).to.be.revertedWith("PCV: Recipient is not in whitelist")
      })
    })

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
      it("removeRecipientFromWhitelist(): removes recipient from the whitelist", async () => {
        await PCVDeployer.removeRecipientFromWhitelist(alice.address)
        expect(await contracts.pcv.recipientsWhitelist(alice.address)).to.equal(
          false,
        )
      })

      it("removeRecipientsFromWhitelist(): removes recipients from the whitelist", async () => {
        await PCVDeployer.removeRecipientsFromWhitelist([
          alice.address,
          council.address,
        ])
        expect(await contracts.pcv.recipientsWhitelist(alice.address)).to.equal(
          false,
        )
        expect(
          await contracts.pcv.recipientsWhitelist(council.address),
        ).to.equal(false)
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

  describe("withdrawCollateral()", () => {
    /**
     *
     * Expected Reverts
     *
     */
    context("Expected Reverts", () => {
      it("withdrawCollateral(): reverts if recipient is not in whitelist", async () => {
        await debtPaid()
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawCollateral(bob.address, bootstrapLoan),
        ).to.be.revertedWith("PCV: recipient must be in whitelist")
      })

      it("withdrawCollateral(): reverts if not enough collateral", async () => {
        await debtPaid()
        await expect(
          contracts.pcv
            .connect(treasury.wallet)
            .withdrawCollateral(alice.address, 1n),
        ).to.be.revertedWith("Sending BTC failed")
      })
    })

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
      it("withdrawCollateral(): withdraws BTC to recipient", async () => {
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
})
