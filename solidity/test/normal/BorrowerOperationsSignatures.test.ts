import { expect } from "chai"
import { ethers } from "hardhat"
import {
  getLatestBlockTimestamp,
  getOpenTroveTotalDebt,
  NO_GAS,
  openTrove,
  performRedemption,
  setDefaultFees,
  setInterestRate,
  setupTests,
  TestingAddresses,
  updateTroveSnapshot,
  updateWalletSnapshot,
  updateWalletSnapshots,
  User,
} from "../helpers"
import { to1e18 } from "../utils"
import { Contracts } from "../helpers/interfaces"
import { ZERO_ADDRESS } from "../../helpers/constants"

describe("BorrowerOperationsSignatures in Normal Mode", () => {
  let addresses: TestingAddresses
  // users
  let alice: User
  let bob: User
  let carol: User
  let council: User
  let dennis: User
  let deployer: User
  let treasury: User
  let contracts: Contracts

  const FAKE_SIGNATURE =
    "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

  async function defaultTrovesSetup() {
    // data setup
    const transactions = [
      {
        musdAmount: "10,000",
        sender: alice.wallet,
        ICR: "150",
      },
      {
        musdAmount: "20,000",
        sender: bob.wallet,
        ICR: "150",
      },
    ]

    for (let i = 0; i < transactions.length; i++) {
      await openTrove(contracts, transactions[i])
    }
  }

  async function setupCarolsTrove() {
    await openTrove(contracts, {
      musdAmount: "20,000",
      ICR: "500",
      sender: carol.wallet,
    })
  }

  async function setupSignatureTests(borrowerUser: User = carol) {
    const borrower = borrowerUser.address
    const contractAddress = addresses.borrowerOperationsSignatures
    const nonce =
      await contracts.borrowerOperationsSignatures.getNonce(borrower)
    const domain = {
      name: "BorrowerOperationsSignatures",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: contractAddress,
    }
    const deadline = BigInt(await getLatestBlockTimestamp()) + 3600n // 1 hour from now
    const interestRate = await contracts.interestRateManager.interestRate()

    return {
      borrower,
      recipient: borrower,
      contractAddress,
      nonce,
      domain,
      deadline,
      interestRate,
    }
  }

  // @ts-expect-error implicit any is okay here
  async function verifyPoolRecipientReverts(f, args) {
    const pools = [
      {
        error:
          "BorrowerOperationsSignatures: recipient must not be the active pool",
        address: addresses.activePool,
      },
      {
        error:
          "BorrowerOperationsSignatures: recipient must not be the coll surplus pool",
        address: addresses.collSurplusPool,
      },
      {
        error:
          "BorrowerOperationsSignatures: recipient must not be the default pool",
        address: addresses.defaultPool,
      },
      {
        error:
          "BorrowerOperationsSignatures: recipient must not be the stability pool",
        address: addresses.stabilityPool,
      },
    ]
    /* eslint-disable no-restricted-syntax */
    for (const { error, address } of pools) {
      const fullArgs = [...args, address, FAKE_SIGNATURE, 0n]
      await expect(f(...fullArgs)).to.be.revertedWith(error)
    }
    /* eslint-enable no-restricted-syntax */
  }

  beforeEach(async () => {
    ;({
      alice,
      bob,
      carol,
      council,
      dennis,
      deployer,
      treasury,
      contracts,
      addresses,
    } = await setupTests())

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()

    await setDefaultFees(contracts, council)

    await defaultTrovesSetup()
  })

  describe("openTroveWithSignature()", () => {
    const debtAmount = to1e18(2000)
    const assetAmount = to1e18(10)
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    const types = {
      OpenTrove: [
        { name: "assetAmount", type: "uint256" },
        { name: "debtAmount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    it("opens a trove with a valid signature and deadline", async () => {
      const { borrower, recipient, nonce, domain, deadline } =
        await setupSignatureTests()

      const value = {
        assetAmount,
        debtAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await carol.wallet.signTypedData(domain, types, value)

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .openTroveWithSignature(
          debtAmount,
          upperHint,
          lowerHint,
          carol.address,
          carol.address,
          signature,
          deadline,
          { value: assetAmount },
        )

      await updateTroveSnapshot(contracts, carol, "after")

      // Account for borrowing fee and gas compensation
      const expectedDebt = await getOpenTroveTotalDebt(contracts, debtAmount)
      expect(carol.trove.debt.after).to.be.equal(expectedDebt)
    })

    it("withdraws the mUSD to the recipient", async () => {
      const { borrower, nonce, domain, deadline } = await setupSignatureTests()

      const recipient = dennis.wallet.address

      const value = {
        assetAmount,
        debtAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await carol.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .openTroveWithSignature(
          debtAmount,
          upperHint,
          lowerHint,
          carol.address,
          recipient,
          signature,
          deadline,
          { value: assetAmount },
        )

      await updateWalletSnapshot(contracts, dennis, "after")

      expect(dennis.musd.after).to.equal(dennis.musd.before + debtAmount)
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, recipient, nonce, domain, deadline } =
        await setupSignatureTests()

      const value = {
        assetAmount,
        debtAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await carol.wallet.signTypedData(domain, types, value)

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .openTroveWithSignature(
          debtAmount,
          upperHint,
          lowerHint,
          carol.address,
          carol.address,
          signature,
          deadline,
          { value: assetAmount },
        )

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)

      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        override: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        const { borrower, recipient, nonce, deadline } =
          await setupSignatureTests()

        const data = {
          assetAmount,
          borrower,
          recipient,
          debtAmount,
          upperHint,
          lowerHint,
          nonce,
          deadline,
          signer: carol.wallet,
          caller: carol.wallet,
          verifyingContract: addresses.borrowerOperationsSignatures,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
        }

        const overridenData = { ...data, ...override }

        const domain = {
          name: overridenData.domainName,
          version: overridenData.domainVersion,
          chainId: overridenData.chainId,
          verifyingContract: overridenData.verifyingContract,
        }

        const signedValues = {
          assetAmount: data.assetAmount,
          borrower: data.borrower,
          recipient: data.recipient,
          debtAmount: data.debtAmount,
          nonce: overridenData.nonce,
          deadline: data.deadline,
        }

        const signature = await overridenData.signer.signTypedData(
          domain,
          types,
          signedValues,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overridenData.caller)
            .openTroveWithSignature(
              overridenData.debtAmount,
              overridenData.upperHint,
              overridenData.lowerHint,
              overridenData.borrower,
              overridenData.recipient,
              signature,
              overridenData.deadline,
              { value: overridenData.assetAmount },
            ),
        ).to.be.revertedWith(message)
      }
      it("reverts when the recovered address does not match the borrower's", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the signed recipient doesn't match the call", async () => {
        await testRevert({ recipient: dennis.wallet })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 42 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        await testRevert(
          { verifyingContract: addresses.pcv }, // PCV contract address instead of BorrowerOperations
        )
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the collateral amount is different than the signed value", async () => {
        await testRevert({ assetAmount: to1e18("22") })
      })

      it("reverts when the debt is different than the signed value", async () => {
        await testRevert({ debtAmount: to1e18("8000") })
      })

      it("reverts when the implementation is called from a non-BorrowerOperations or BorrowerOperationsSignatures address", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .restrictedOpenTrove(
              bob.address,
              bob.address,
              debtAmount,
              upperHint,
              lowerHint,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Caller is not BorrowerOperationsSignatures",
        )
      })
    })
  })

  describe("closeTroveWithSignature()", () => {
    const types = {
      CloseTrove: [
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    beforeEach(async () => {
      // Artificially mint to Bob so he has enough to close his trove
      await contracts.musd.unprotectedMint(bob.wallet, to1e18("20,000"))
    })

    it("closes the Trove with a valid signature", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      // grant alice enough tokens to let her close bob's trove
      await contracts.musd.unprotectedMint(alice.wallet, to1e18("40,000"))

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .closeTroveWithSignature(borrower, borrower, signature, deadline)

      expect(bob.trove.status.after).to.equal(0)
    })

    it("releases collateral to the recipient", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const recipient = dennis.wallet.address

      const value = {
        borrower,
        recipient,
        nonce,
        deadline,
      }

      // grant alice enough tokens to let her close bob's trove
      await contracts.musd.unprotectedMint(alice.wallet, to1e18("40,000"))

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .closeTroveWithSignature(borrower, recipient, signature, deadline)

      await updateWalletSnapshot(contracts, dennis, "after")

      expect(dennis.btc.after).to.equal(
        dennis.btc.before + bob.trove.collateral.before,
      )
    })

    it("uses the caller's musd to close the trove", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const recipient = dennis.wallet.address

      const value = {
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      // grant alice enough tokens to let her close bob's trove
      await contracts.musd.unprotectedMint(alice.wallet, to1e18("40,000"))

      await updateWalletSnapshots(contracts, [alice, bob, dennis], "before")

      // Alice pays for Bob's trove to close and send the funds to Dennis
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .closeTroveWithSignature(
          borrower,
          recipient,
          signature,
          deadline,
          NO_GAS,
        )

      await updateWalletSnapshots(contracts, [alice, bob, dennis], "after")

      // Alice must pay all of bob's debt except the $200 gas comp
      expect(alice.musd.after).to.equal(
        alice.musd.before - bob.trove.debt.before + to1e18(200),
      )
      expect(alice.btc.after).to.equal(alice.btc.before)

      expect(bob.musd.after).to.equal(bob.musd.before)
      expect(bob.btc.after).to.equal(bob.btc.before)

      expect(dennis.musd.after).to.equal(dennis.musd.before)
      expect(dennis.btc.after).to.equal(
        dennis.btc.before + bob.trove.collateral.before,
      )
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      // grant alice enough tokens to let her close bob's trove
      await contracts.musd.unprotectedMint(alice.wallet, to1e18("40,000"))

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .closeTroveWithSignature(borrower, borrower, signature, deadline)

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)
      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        override: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        const { borrower, recipient, deadline, nonce } =
          await setupSignatureTests(bob)

        const data = {
          borrower,
          recipient,
          nonce,
          deadline,
          signer: bob.wallet,
          caller: alice.wallet,
          verifyingContract: addresses.borrowerOperationsSignatures,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
        }

        const overridenData = { ...data, ...override }

        const domain = {
          name: overridenData.domainName,
          version: overridenData.domainVersion,
          chainId: overridenData.chainId,
          verifyingContract: overridenData.verifyingContract,
        }

        const signedValues = {
          borrower: data.borrower,
          recipient: data.recipient,
          nonce: overridenData.nonce,
          deadline: data.deadline,
        }

        const signature = await overridenData.signer.signTypedData(
          domain,
          types,
          signedValues,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overridenData.caller)
            .closeTroveWithSignature(
              overridenData.borrower,
              overridenData.recipient,
              signature,
              overridenData.deadline,
            ),
        ).to.be.revertedWith(message)
      }
      it("reverts when the recovered address does not match the borrower's address", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the signed recipient does not match the call", async () => {
        await testRevert({ recipient: dennis.wallet.address })
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 42 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        await testRevert({ verifyingContract: addresses.pcv })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0 })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the implementation is called from a non-BorrowerOperationsSignatures address", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .restrictedCloseTrove(bob.address, bob.address, bob.address),
        ).to.be.revertedWith(
          "BorrowerOps: Caller is not BorrowerOperationsSignatures",
        )
      })

      it("reverts when the caller does not have sufficient MUSD to close the trove", async () => {
        // grant Bob (the borrower) enough MUSD to close the trove
        await contracts.musd.unprotectedMint(bob.wallet, to1e18("40,000"))

        // Alice (the caller) does not have enough MUSD to close the trove
        await testRevert(
          {},
          "BorrowerOps: Caller doesnt have enough mUSD to make repayment",
        )
      })

      it("reverts when the recipient is a pool", async () => {
        await verifyPoolRecipientReverts(
          contracts.borrowerOperationsSignatures.connect(bob.wallet)
            .closeTroveWithSignature,
          [bob.wallet],
        )
      })
    })
  })

  describe("addCollWithSignature()", () => {
    const assetAmount = to1e18(1)
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    const types = {
      AddColl: [
        { name: "assetAmount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    it("adds the correct collateral amount to the trove with a valid signature", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        assetAmount,
        borrower,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .addCollWithSignature(
          upperHint,
          lowerHint,
          bob.address,
          signature,
          deadline,
          { value: assetAmount },
        )

      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.collateral.after).to.equal(
        bob.trove.collateral.before + assetAmount,
      )
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        borrower,
        assetAmount,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .addCollWithSignature(
          upperHint,
          lowerHint,
          bob.address,
          signature,
          deadline,
          { value: assetAmount },
        )

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)

      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        overrides: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        const { borrower, deadline, nonce } = await setupSignatureTests(bob)

        const data = {
          assetAmount,
          upperHint,
          lowerHint,
          borrower,
          nonce,
          deadline,
          caller: carol.wallet,
          signer: bob.wallet,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const overridenData = { ...data, ...overrides }

        const value = {
          assetAmount: data.assetAmount,
          borrower: data.borrower,
          nonce: overridenData.nonce,
          deadline: data.deadline,
        }

        const domain = {
          name: overridenData.domainName,
          version: overridenData.domainVersion,
          chainId: overridenData.chainId,
          verifyingContract: overridenData.verifyingContract,
        }

        const signature = await overridenData.signer.signTypedData(
          domain,
          types,
          value,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overridenData.caller)
            .addCollWithSignature(
              overridenData.upperHint,
              overridenData.lowerHint,
              overridenData.borrower,
              signature,
              overridenData.deadline,
              { value: overridenData.assetAmount },
            ),
        ).to.be.revertedWith(message)
      }

      it("reverts when the recovered address does not match the borrower's", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 777 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        const verifyingContract = addresses.pcv // PCV contract address instead of BorrowerOperations
        await testRevert({ verifyingContract })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the collateral amount is different than the signed value", async () => {
        await testRevert({ assetAmount: to1e18("22") })
      })
    })
  })

  describe("withdrawCollWithSignature()", () => {
    const amount = 1n
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    const types = {
      WithdrawColl: [
        { name: "amount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    it("reduces the Trove's collateral by the correct amount with a valid signature", async () => {
      await setupCarolsTrove() // open additional trove to prevent going into recovery mode
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        amount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .withdrawCollWithSignature(
          amount,
          upperHint,
          lowerHint,
          bob.address,
          bob.address,
          signature,
          deadline,
        )

      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.collateral.after).to.equal(
        bob.trove.collateral.before - amount,
      )
    })

    it("sends the collateral to the recipient with a valid signature", async () => {
      await setupCarolsTrove() // open additional trove to prevent going into recovery mode
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const recipient = dennis.wallet.address

      const value = {
        amount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .withdrawCollWithSignature(
          amount,
          upperHint,
          lowerHint,
          bob.address,
          recipient,
          signature,
          deadline,
        )

      await updateWalletSnapshot(contracts, dennis, "after")

      expect(dennis.btc.after).to.equal(dennis.btc.before + amount)
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      await setupCarolsTrove()
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        borrower,
        recipient,
        amount,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await contracts.borrowerOperationsSignatures
        .connect(carol.wallet)
        .withdrawCollWithSignature(
          amount,
          upperHint,
          lowerHint,
          bob.address,
          bob.address,
          signature,
          deadline,
        )

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)

      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        overrides: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        await setupCarolsTrove()
        const { borrower, recipient, nonce, deadline } =
          await setupSignatureTests(bob)

        const data = {
          amount,
          borrower,
          recipient,
          nonce,
          deadline,
          signer: bob.wallet,
          caller: carol.wallet,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const overriddenData = { ...data, ...overrides }

        const value = {
          amount: data.amount,
          borrower: data.borrower,
          recipient: data.recipient,
          nonce: overriddenData.nonce,
          deadline: data.deadline,
        }

        const domain = {
          name: overriddenData.domainName,
          version: overriddenData.domainVersion,
          chainId: overriddenData.chainId,
          verifyingContract: overriddenData.verifyingContract,
        }

        const signature = await overriddenData.signer.signTypedData(
          domain,
          types,
          value,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overriddenData.caller)
            .withdrawCollWithSignature(
              overriddenData.amount,
              upperHint,
              lowerHint,
              overriddenData.borrower,
              overriddenData.recipient,
              signature,
              overriddenData.deadline,
            ),
        ).to.be.revertedWith(message)
      }

      it("reverts when the recovered address does not match the borrower's", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the signed recipient does not match the call", async () => {
        await testRevert({ recipient: dennis.address })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 1234n })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        const verifyingContract = addresses.pcv // PCV contract address instead of BorrowerOperations
        await testRevert({ verifyingContract })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the asset amount is does not match the signed value", async () => {
        await testRevert({ amount: to1e18(777) })
      })

      it("reverts when the recipient is a pool", async () => {
        await verifyPoolRecipientReverts(
          contracts.borrowerOperationsSignatures.connect(bob.wallet)
            .withdrawCollWithSignature,
          [0n, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS],
        )
      })
    })
  })

  describe("withdrawMUSDWithSignature()", () => {
    const amount = to1e18("1")
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    const types = {
      WithdrawMUSD: [
        { name: "amount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    beforeEach(async () => {
      // Open an additional trove to keep us from going into recovery mode
      await setupCarolsTrove()
    })

    it("increases the Trove's debt by the correct amount with a valid signature", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { domain, deadline } = await setupSignatureTests()
      const borrower = bob.address
      const recipient = bob.address
      const nonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)
      const value = {
        amount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .withdrawMUSDWithSignature(
          amount,
          upperHint,
          lowerHint,
          borrower,
          borrower,
          signature,
          deadline,
        )
      const borrowingRate = await contracts.borrowerOperations.borrowingRate()
      await updateTroveSnapshot(contracts, bob, "after")
      expect(bob.trove.debt.after).to.equal(
        bob.trove.debt.before +
          (amount * (to1e18(1) + borrowingRate)) / to1e18(1),
      )
    })

    it("send the mUSD to the recipient", async () => {
      const { domain, deadline } = await setupSignatureTests()
      const borrower = bob.address
      const recipient = dennis.address
      const nonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)

      const value = {
        amount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .withdrawMUSDWithSignature(
          amount,
          upperHint,
          lowerHint,
          borrower,
          recipient,
          signature,
          deadline,
        )

      await updateWalletSnapshot(contracts, dennis, "after")
      expect(dennis.musd.after).to.equal(dennis.musd.before + amount)
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        amount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .withdrawMUSDWithSignature(
          amount,
          upperHint,
          lowerHint,
          borrower,
          borrower,
          signature,
          deadline,
        )

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)
      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        override: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        const { borrower, recipient, nonce, deadline } =
          await setupSignatureTests(bob)

        const data = {
          amount,
          upperHint,
          lowerHint,
          borrower,
          recipient,
          nonce,
          deadline,
          signer: bob.wallet,
          caller: alice.wallet,
          types,
          verifyingContract: addresses.borrowerOperationsSignatures,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
        }

        const overridenData = { ...data, ...override }

        const domain = {
          name: overridenData.domainName,
          version: overridenData.domainVersion,
          chainId: overridenData.chainId,
          verifyingContract: overridenData.verifyingContract,
        }

        const signedValues = {
          amount: data.amount,
          borrower: data.borrower,
          recipient: data.recipient,
          nonce: overridenData.nonce,
          deadline: data.deadline,
        }

        const signature = await overridenData.signer.signTypedData(
          domain,
          types,
          signedValues,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overridenData.caller)
            .withdrawMUSDWithSignature(
              overridenData.amount,
              overridenData.upperHint,
              overridenData.lowerHint,
              overridenData.borrower,
              overridenData.recipient,
              signature,
              overridenData.deadline,
            ),
        ).to.be.revertedWith(message)
      }

      it("reverts when withdrawal exceeds maxBorrowingCapacity", async () => {
        // Price increases 50,000 --> 300,000
        const price = to1e18("300,000")
        await contracts.mockAggregator.connect(deployer.wallet).setPrice(price)

        const { borrower, recipient, nonce, deadline } =
          await setupSignatureTests(bob)

        const changedAmount = to1e18("10,000")

        const domain = {
          name: "BorrowerOperationsSignatures",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const signedValues = {
          amount: changedAmount,
          borrower,
          recipient,
          nonce,
          deadline,
        }

        const signature = await bob.wallet.signTypedData(
          domain,
          types,
          signedValues,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(alice.wallet)
            .withdrawMUSDWithSignature(
              changedAmount,
              upperHint,
              lowerHint,
              borrower,
              recipient,
              signature,
              deadline,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: An operation that exceeds maxBorrowingCapacity is not permitted",
        )
      })

      it("reverts when the recovered address does not match the borrower's address", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the signed recipient does not match the call", async () => {
        await testRevert({ recipient: dennis.address })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 111 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        const verifyingContract = addresses.pcv // PCV contract address instead of BorrowerOperations
        await testRevert({ verifyingContract })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the musd amount does not match the signature", async () => {
        await testRevert({ amount: to1e18(42) })
      })
    })
  })

  describe("repayMUSDWithSignature()", () => {
    const amount = to1e18("100")
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    const types = {
      RepayMUSD: [
        { name: "amount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    it("reduces the Trove's debt by the correct amount with a valid signature", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)
      const value = {
        amount,
        borrower,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .repayMUSDWithSignature(
          amount,
          upperHint,
          lowerHint,
          borrower,
          signature,
          deadline,
        )
      await updateTroveSnapshot(contracts, bob, "after")
      expect(bob.trove.debt.after).to.equal(bob.trove.debt.before - amount)
    })

    it("the caller pays the mUSD", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)
      const value = {
        amount,
        borrower,
        nonce,
        deadline,
      }

      await updateWalletSnapshot(contracts, alice, "before")
      await updateWalletSnapshot(contracts, bob, "before")

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .repayMUSDWithSignature(
          amount,
          upperHint,
          lowerHint,
          borrower,
          signature,
          deadline,
        )

      await updateWalletSnapshot(contracts, alice, "after")
      await updateWalletSnapshot(contracts, bob, "after")
      expect(alice.musd.after).to.equal(alice.musd.before - amount)
      expect(bob.musd.after).to.equal(bob.musd.before)
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)
      const value = {
        amount,
        borrower,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .repayMUSDWithSignature(
          amount,
          upperHint,
          lowerHint,
          borrower,
          signature,
          deadline,
        )

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)
      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        overrides: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        const { borrower, nonce, deadline } = await setupSignatureTests(bob)

        const data = {
          amount,
          upperHint,
          lowerHint,
          borrower,
          nonce,
          deadline,
          signer: bob.wallet,
          caller: alice.wallet,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const overriddenData = { ...data, ...overrides }

        const value = {
          amount: data.amount,
          borrower: data.borrower,
          nonce: overriddenData.nonce,
          deadline: data.deadline,
        }

        const domain = {
          name: overriddenData.domainName,
          version: overriddenData.domainVersion,
          chainId: overriddenData.chainId,
          verifyingContract: overriddenData.verifyingContract,
        }

        const signature = await overriddenData.signer.signTypedData(
          domain,
          types,
          value,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overriddenData.caller)
            .repayMUSDWithSignature(
              overriddenData.amount,
              overriddenData.upperHint,
              overriddenData.lowerHint,
              overriddenData.borrower,
              signature,
              overriddenData.deadline,
            ),
        ).to.be.revertedWith(message)
      }
      it("reverts when the recovered address does not match the borrower's address", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 87 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        const verifyingContract = addresses.pcv // PCV contract address instead of BorrowerOperations
        await testRevert({ verifyingContract })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the amount does not match the signature", async () => {
        await testRevert({ amount: to1e18(333) })
      })
    })
  })

  describe("adjustTroveWithSignature()", () => {
    const collWithdrawal = 0
    const debtChange = to1e18("50")
    const isDebtIncrease = true
    const assetAmount = 0
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    const types = {
      AdjustTrove: [
        { name: "collWithdrawal", type: "uint256" },
        { name: "debtChange", type: "uint256" },
        { name: "isDebtIncrease", type: "bool" },
        { name: "assetAmount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    beforeEach(async () => {
      // Open an additional trove to keep us from going into recovery mode
      await setupCarolsTrove()
    })

    it("adjusts the Trove's debt by the correct amount with a valid signature", async () => {
      await updateTroveSnapshot(contracts, bob, "before")
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        collWithdrawal,
        debtChange,
        isDebtIncrease,
        assetAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .adjustTroveWithSignature(
          collWithdrawal,
          debtChange,
          isDebtIncrease,
          upperHint,
          lowerHint,
          borrower,
          borrower,
          signature,
          deadline,
        )

      // Note this test only covers a debt increase, but the trove adjustment logic is shared with `adjustTrove`
      await updateTroveSnapshot(contracts, bob, "after")
      const borrowingRate = await contracts.borrowerOperations.borrowingRate()
      expect(bob.trove.debt.after).to.equal(
        bob.trove.debt.before +
          (debtChange * (to1e18(1) + borrowingRate)) / to1e18(1),
      )
    })

    it("the caller pays the mUSD", async () => {
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        collWithdrawal,
        debtChange,
        isDebtIncrease: false,
        assetAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, alice, "before")
      await updateWalletSnapshot(contracts, bob, "before")

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .adjustTroveWithSignature(
          collWithdrawal,
          debtChange,
          value.isDebtIncrease,
          upperHint,
          lowerHint,
          borrower,
          borrower,
          signature,
          deadline,
        )

      await updateWalletSnapshot(contracts, alice, "after")
      await updateWalletSnapshot(contracts, bob, "after")

      expect(alice.musd.after).to.equal(alice.musd.before - debtChange)
      expect(bob.musd.after).to.equal(bob.musd.before)
    })

    it("sends collateral to the recipient", async () => {
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const recipient = dennis.wallet.address

      const withdrawnCollateral = 6090000000000000n

      const value = {
        collWithdrawal: withdrawnCollateral,
        debtChange,
        isDebtIncrease,
        assetAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .adjustTroveWithSignature(
          withdrawnCollateral,
          debtChange,
          isDebtIncrease,
          upperHint,
          lowerHint,
          borrower,
          recipient,
          signature,
          deadline,
        )

      await updateWalletSnapshot(contracts, dennis, "after")

      expect(dennis.btc.after).to.equal(dennis.btc.before + withdrawnCollateral)
    })

    it("allows the caller to pay for collateral increases", async () => {
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const recipient = dennis.wallet.address

      const addedCollateral = to1e18(1)

      const value = {
        collWithdrawal: 0n,
        debtChange: 0n,
        isDebtIncrease: false,
        assetAmount: addedCollateral,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await updateTroveSnapshot(contracts, bob, "before")

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .adjustTroveWithSignature(
          value.collWithdrawal,
          value.debtChange,
          value.isDebtIncrease,
          upperHint,
          lowerHint,
          value.borrower,
          value.recipient,
          signature,
          value.deadline,
          { value: value.assetAmount },
        )

      await updateTroveSnapshot(contracts, bob, "after")

      expect(bob.trove.collateral.after).to.equal(
        bob.trove.collateral.before + addedCollateral,
      )
    })

    it("sends musd to the recipient", async () => {
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const recipient = dennis.wallet.address

      const value = {
        collWithdrawal,
        debtChange,
        isDebtIncrease,
        assetAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, dennis, "before")

      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .adjustTroveWithSignature(
          collWithdrawal,
          debtChange,
          isDebtIncrease,
          upperHint,
          lowerHint,
          borrower,
          recipient,
          signature,
          deadline,
        )

      await updateWalletSnapshot(contracts, dennis, "after")

      expect(dennis.musd.after).to.equal(dennis.musd.before + debtChange)
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      const value = {
        collWithdrawal,
        debtChange,
        isDebtIncrease,
        assetAmount,
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .adjustTroveWithSignature(
          collWithdrawal,
          debtChange,
          isDebtIncrease,
          upperHint,
          lowerHint,
          borrower,
          borrower,
          signature,
          deadline,
        )

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)
      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        overrides: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        const { borrower, recipient, nonce, deadline } =
          await setupSignatureTests(bob)

        const data = {
          collWithdrawal,
          debtChange,
          isDebtIncrease,
          assetAmount,
          upperHint,
          lowerHint,
          borrower,
          recipient,
          nonce,
          deadline,
          signer: bob.wallet,
          caller: carol.wallet,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const overriddenData = { ...data, ...overrides }

        const value = {
          collWithdrawal: data.collWithdrawal,
          debtChange: data.debtChange,
          isDebtIncrease: data.isDebtIncrease,
          assetAmount: data.assetAmount,
          borrower: data.borrower,
          recipient: data.recipient,
          nonce: overriddenData.nonce,
          deadline: data.deadline,
        }

        const domain = {
          name: overriddenData.domainName,
          version: overriddenData.domainVersion,
          chainId: overriddenData.chainId,
          verifyingContract: overriddenData.verifyingContract,
        }

        const signature = await overriddenData.signer.signTypedData(
          domain,
          types,
          value,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overriddenData.caller)
            .adjustTroveWithSignature(
              overriddenData.collWithdrawal,
              overriddenData.debtChange,
              overriddenData.isDebtIncrease,
              overriddenData.upperHint,
              overriddenData.lowerHint,
              overriddenData.borrower,
              overriddenData.recipient,
              signature,
              overriddenData.deadline,
              { value: overriddenData.assetAmount },
            ),
        ).to.be.revertedWith(message)
      }

      it("reverts when the recovered address does not match the borrower's address", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the signed recipient does not match the call", async () => {
        await testRevert({ recipient: dennis.address })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 999 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        const verifyingContract = addresses.pcv // PCV contract address instead of BorrowerOperations
        await testRevert({ verifyingContract })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the collateral withdrawn does not match the signature", async () => {
        await testRevert({ collWithdrawal: to1e18(123) })
      })

      it("reverts when the debt change does not match the signature", async () => {
        await testRevert({ debtChange: to1e18(7) })
      })

      it("reverts when the debt increase flag does not match the signature", async () => {
        await testRevert({ isDebtIncrease: false })
      })

      it("reverts when the asset amount does not match the signature", async () => {
        await testRevert({ assetAmount: to1e18(888) })
      })

      it("reverts when the implementation is called from a non-BorrowerOperationsSignatures address", async () => {
        await expect(
          contracts.borrowerOperations
            .connect(bob.wallet)
            .restrictedAdjustTrove(
              bob.address,
              bob.address,
              alice.address,
              0,
              to1e18(100),
              false,
              bob.address,
              bob.address,
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Caller is not BorrowerOperationsSignatures",
        )
      })

      it("reverts when the caller does not have sufficient MUSD to repay debt", async () => {
        const { borrower, recipient, nonce, deadline } =
          await setupSignatureTests(bob)

        const data = {
          collWithdrawal,
          debtChange,
          isDebtIncrease: false,
          assetAmount,
          upperHint,
          lowerHint,
          borrower,
          recipient,
          nonce,
          deadline,
          signer: bob.wallet,
          caller: dennis.wallet, // Dennis does not have enough MUSD to repay debt
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const value = {
          collWithdrawal: data.collWithdrawal,
          debtChange: data.debtChange,
          isDebtIncrease: data.isDebtIncrease,
          assetAmount: data.assetAmount,
          borrower: data.borrower,
          recipient: data.recipient,
          nonce: data.nonce,
          deadline: data.deadline,
        }

        const domain = {
          name: data.domainName,
          version: data.domainVersion,
          chainId: data.chainId,
          verifyingContract: data.verifyingContract,
        }

        const signature = await data.signer.signTypedData(domain, types, value)

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(data.caller)
            .adjustTroveWithSignature(
              data.collWithdrawal,
              data.debtChange,
              data.isDebtIncrease,
              data.upperHint,
              data.lowerHint,
              data.borrower,
              data.recipient,
              signature,
              data.deadline,
              { value: data.assetAmount },
            ),
        ).to.be.revertedWith(
          "BorrowerOps: Caller doesnt have enough mUSD to make repayment",
        )
      })

      it("reverts when the recipient is a pool", async () => {
        await verifyPoolRecipientReverts(
          contracts.borrowerOperationsSignatures.connect(bob.wallet)
            .adjustTroveWithSignature,
          [0n, 0n, true, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS],
        )
      })
    })
  })

  describe("refinanceWithSignature()", () => {
    const types = {
      Refinance: [
        { name: "borrower", type: "address" },
        { name: "interestRate", type: "uint16" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    it("changes the trove's interest rate to the current interest rate with a valid signature", async () => {
      const newRate = 1000
      await setInterestRate(contracts, council, newRate)
      const { borrower, interestRate, domain, nonce } =
        await setupSignatureTests(bob)

      // Open a trove with high ICR to prevent recovery mode
      await setupCarolsTrove()

      // account for governance delay in setting interest rate
      const timeToNewRate = BigInt(7 * 24 * 60 * 60) // 7 days in seconds
      const deadline =
        BigInt(await getLatestBlockTimestamp()) + 3600n + timeToNewRate // 1 hour from interest rate change approval

      const value = {
        borrower,
        interestRate,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .refinanceWithSignature(
          alice.address,
          alice.address,
          borrower,
          signature,
          deadline,
        )

      await updateTroveSnapshot(contracts, bob, "after")
      expect(bob.trove.interestRate.after).to.equal(newRate)
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, interestRate, domain, deadline, nonce } =
        await setupSignatureTests(bob)

      // Open a trove with high ICR to prevent recovery mode
      await setupCarolsTrove()

      const value = {
        borrower,
        interestRate,
        nonce,
        deadline,
      }

      const signature = await bob.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(alice.wallet)
        .refinanceWithSignature(
          alice.address,
          alice.address,
          borrower,
          signature,
          deadline,
        )

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)
      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        overrides: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        const { borrower, interestRate, nonce, deadline } =
          await setupSignatureTests(bob)

        const data = {
          borrower,
          interestRate,
          nonce,
          deadline,
          signer: bob.wallet,
          caller: alice.wallet,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const overriddenData = { ...data, ...overrides }

        const value = {
          borrower: data.borrower,
          interestRate: overriddenData.interestRate,
          nonce: overriddenData.nonce,
          deadline: data.deadline,
        }

        const domain = {
          name: overriddenData.domainName,
          version: overriddenData.domainVersion,
          chainId: overriddenData.chainId,
          verifyingContract: overriddenData.verifyingContract,
        }

        const signature = await overriddenData.signer.signTypedData(
          domain,
          types,
          value,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overriddenData.caller)
            .refinanceWithSignature(
              ZERO_ADDRESS,
              ZERO_ADDRESS,
              overriddenData.borrower,
              signature,
              overriddenData.deadline,
            ),
        ).to.be.revertedWith(message)
      }

      it("reverts when the recovered address does not match the borrower's address", async () => {
        await testRevert({ signer: alice.wallet })
      })

      it("reverts when the interest rate is different than the signed value", async () => {
        await testRevert({ interestRate: 200 })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 666 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        const verifyingContract = addresses.pcv // PCV contract address instead of BorrowerOperations
        await testRevert({ verifyingContract })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })
    })
  })

  describe("claimCollateralWithSignature()", () => {
    const types = {
      ClaimCollateral: [
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    beforeEach(async () => {
      // Redeem against Alice's trove so she has a surplus to claim
      await updateTroveSnapshot(contracts, alice, "before")
      await updateWalletSnapshot(contracts, alice, "before")
      await performRedemption(contracts, bob, alice, alice.trove.debt.before)
    })

    it("allows the user to claim their collateral surplus with a valid signature", async () => {
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(alice)

      const value = {
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await alice.wallet.signTypedData(domain, types, value)

      const surplus = await contracts.collSurplusPool.getCollateral(
        alice.wallet,
      )

      await contracts.borrowerOperationsSignatures
        .connect(bob.wallet)
        .claimCollateralWithSignature(
          borrower,
          borrower,
          signature,
          deadline,
          NO_GAS,
        )

      await updateWalletSnapshot(contracts, alice, "after")

      expect(alice.btc.after).to.equal(alice.btc.before + surplus)
    })

    it("sends the collateral to the recipient", async () => {
      const { borrower, domain, deadline, nonce } =
        await setupSignatureTests(alice)

      const recipient = dennis.address

      const value = {
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await alice.wallet.signTypedData(domain, types, value)

      await updateWalletSnapshot(contracts, dennis, "before")
      const surplus = await contracts.collSurplusPool.getCollateral(
        alice.wallet,
      )

      await contracts.borrowerOperationsSignatures
        .connect(bob.wallet)
        .claimCollateralWithSignature(borrower, recipient, signature, deadline)

      await updateWalletSnapshot(contracts, dennis, "after")

      expect(dennis.btc.after).to.equal(dennis.btc.before + surplus)
    })

    it("correctly increments the nonce after a successful transaction", async () => {
      const { borrower, recipient, domain, deadline, nonce } =
        await setupSignatureTests(alice)

      const value = {
        borrower,
        recipient,
        nonce,
        deadline,
      }

      const signature = await alice.wallet.signTypedData(domain, types, value)
      await contracts.borrowerOperationsSignatures
        .connect(bob.wallet)
        .claimCollateralWithSignature(borrower, borrower, signature, deadline)

      const newNonce =
        await contracts.borrowerOperationsSignatures.getNonce(borrower)
      expect(newNonce - nonce).to.equal(1)
    })

    context("Expected Reverts", () => {
      const testRevert = async (
        overrides: object,
        message: string = "BorrowerOperationsSignatures: Invalid signature",
      ) => {
        await setupCarolsTrove()
        const { borrower, recipient, nonce, deadline } =
          await setupSignatureTests(alice)

        const data = {
          borrower,
          recipient,
          nonce,
          deadline,
          signer: alice.wallet,
          caller: carol.wallet,
          domainName: "BorrowerOperationsSignatures",
          domainVersion: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: addresses.borrowerOperationsSignatures,
        }

        const overriddenData = { ...data, ...overrides }

        const value = {
          borrower: data.borrower,
          recipient: data.recipient,
          nonce: overriddenData.nonce,
          deadline: data.deadline,
        }

        const domain = {
          name: overriddenData.domainName,
          version: overriddenData.domainVersion,
          chainId: overriddenData.chainId,
          verifyingContract: overriddenData.verifyingContract,
        }

        const signature = await overriddenData.signer.signTypedData(
          domain,
          types,
          value,
        )

        await expect(
          contracts.borrowerOperationsSignatures
            .connect(overriddenData.caller)
            .claimCollateralWithSignature(
              overriddenData.borrower,
              overriddenData.recipient,
              signature,
              overriddenData.deadline,
            ),
        ).to.be.revertedWith(message)
      }

      it("reverts when the recovered address does not match the borrower's address", async () => {
        await testRevert({ signer: bob.wallet })
      })

      it("reverts when the signed recipient does not match the call", async () => {
        await testRevert({ recipient: dennis.address })
      })

      it("reverts when the deadline has passed", async () => {
        const deadline = BigInt(await getLatestBlockTimestamp()) - 1n // 1 second ago
        await testRevert({ deadline }, "Signature expired")
      })

      it("reverts when the nonce is invalid", async () => {
        await testRevert({ nonce: 66 })
      })

      it("reverts when the contract address is not correctly specified", async () => {
        const verifyingContract = addresses.pcv // PCV contract address instead of BorrowerOperations
        await testRevert({ verifyingContract })
      })

      it("reverts when the chain id is not correctly specified", async () => {
        await testRevert({ chainId: 0n })
      })

      it("reverts when the contract version is not correctly specified", async () => {
        await testRevert({ domainVersion: "0" })
      })

      it("reverts when the contract name is not correctly specified", async () => {
        await testRevert({ domainName: "TroveManager" })
      })

      it("reverts when the recipient is a pool", async () => {
        await verifyPoolRecipientReverts(
          contracts.borrowerOperationsSignatures.connect(bob.wallet)
            .claimCollateralWithSignature,
          [ZERO_ADDRESS],
        )
      })
    })
  })
})
