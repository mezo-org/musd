import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import {
  Contracts,
  TestSetup,
  fixture,
  getLatestBlockTimestamp,
  fastForwardTime,
  connectContracts,
  getAddresses,
  TestingAddresses,
} from "./helpers"
import { to1e18, ZERO_ADDRESS, GOVERNANCE_TIME_DELAY } from "./utils"

describe("MUSD", () => {
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let dennis: HardhatEthersSigner
  let deployer: HardhatEthersSigner
  let contracts: Contracts
  let testSetup: TestSetup
  let addresses: TestingAddresses

  beforeEach(async () => {
    testSetup = await loadFixture(fixture)
    contracts = testSetup.contracts
    await connectContracts(contracts, testSetup.users)
    // users
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    dennis = testSetup.users.dennis
    deployer = testSetup.users.deployer
    // readability helper
    addresses = await getAddresses(contracts, testSetup.users)
  })

  describe("Initial State", () => {
    it("name(): returns the token's name", async () => {
      expect(await contracts.musd.name()).to.equal("Mezo USD")
    })

    it("symbol(): returns the token's symbol", async () => {
      expect(await contracts.musd.symbol()).to.equal("MUSD")
    })

    it("decimals(): returns the token's decimals", async () => {
      expect(await contracts.musd.decimals()).to.equal("18")
    })

    it("balanceOf(): gets the balance of the account", async () => {
      let balance = await contracts.musdTester.balanceOf(alice)
      expect(balance).to.be.eq(to1e18(150))

      balance = await contracts.musdTester.balanceOf(bob)
      expect(balance).to.be.eq(to1e18(100))

      balance = await contracts.musdTester.balanceOf(carol)
      expect(balance).to.be.eq(to1e18(50))

      balance = await contracts.musdTester.balanceOf(dennis)
      expect(balance).to.be.eq(to1e18(0))
    })

    it("totalSupply(): gets the total supply", async () => {
      const total = await contracts.musdTester.totalSupply()
      expect(total).to.be.eq(to1e18(300))
    })

    it("Initial set of contracts was set correctly", async () => {
      expect(
        await contracts.musdTester.burnList(addresses.troveManager),
      ).to.equal(true)
      expect(
        await contracts.musdTester.burnList(addresses.stabilityPool),
      ).to.equal(true)
      expect(
        await contracts.musdTester.burnList(addresses.borrowerOperations),
      ).to.equal(true)
      expect(await contracts.musdTester.burnList(deployer)).to.equal(false)
    })
  })

  describe("Approving MUSD", () => {
    it("allowance(): returns an account's spending allowance for another account's balance", async () => {
      await contracts.musdTester.connect(bob).approve(alice, to1e18(100))

      const allowanceA = await contracts.musdTester.allowance(bob, alice)
      const allowanceD = await contracts.musdTester.allowance(bob, dennis)

      expect(allowanceA).to.be.eq(to1e18(100))
      expect(allowanceD).to.be.eq(to1e18(0))
    })

    it("approve(): approves an account to spend the specified amount", async () => {
      const allowanceABefore = await contracts.musdTester.allowance(bob, alice)
      expect(allowanceABefore).to.be.eq(to1e18(0))

      await contracts.musdTester.connect(bob).approve(alice, to1e18(100))

      const allowanceAAfter = await contracts.musdTester.allowance(bob, alice)
      expect(allowanceAAfter).to.be.eq(to1e18(100))
    })

    it("approve(): reverts when spender param is address(0)", async () => {
      await expect(
        contracts.musdTester.connect(bob).approve(ZERO_ADDRESS, to1e18(100)),
      ).to.be.reverted
    })

    it("approve(): reverts when owner param is address(0)", async () => {
      await expect(
        contracts.musdTester
          .connect(bob)
          .callInternalApprove(ZERO_ADDRESS, alice, to1e18(1000)),
      ).to.be.reverted
    })
  })

  describe("Transferring MUSD", () => {
    it("transferFrom(): successfully transfers from an account which is it approved to transfer from", async () => {
      const allowanceA0 = await contracts.musdTester.allowance(bob, alice)
      expect(allowanceA0).to.be.eq(to1e18(0))

      await contracts.musdTester.connect(bob).approve(alice, to1e18(50))

      // Check A's allowance of Bob's funds has increased
      const allowanceA1 = await contracts.musdTester.allowance(bob, alice)
      expect(allowanceA1).to.be.eq(to1e18(50))

      expect(await contracts.musdTester.balanceOf(carol)).to.be.eq(to1e18(50))

      // Alice transfers from bob to Carol, using up her allowance
      await contracts.musdTester
        .connect(alice)
        .transferFrom(bob, carol, to1e18(50))
      expect(await contracts.musdTester.balanceOf(carol)).to.be.eq(to1e18(100))

      // Check A's allowance of Bob's funds has decreased
      const allowanceA2 = await contracts.musdTester.allowance(bob, alice)
      expect(allowanceA2).to.be.eq(to1e18(0))

      // Check bob's balance has decreased
      expect(await contracts.musdTester.balanceOf(bob)).to.be.eq(to1e18(50))

      // Alice tries to transfer more tokens from bob's account to carol than she's allowed
      await expect(
        contracts.musdTester
          .connect(alice)
          .transferFrom(bob, carol, to1e18(50)),
      ).to.be.reverted
    })

    it("transfer(): increases the recipient's balance by the correct amount", async () => {
      expect(await contracts.musdTester.balanceOf(alice)).to.be.eq(to1e18(150))

      await contracts.musdTester
        .connect(bob)
        .transfer(alice, to1e18(37), { from: bob })

      expect(await contracts.musdTester.balanceOf(alice)).to.be.eq(to1e18(187))
    })

    it("transfer(): reverts if amount exceeds sender's balance", async () => {
      expect(await contracts.musdTester.balanceOf(bob)).to.be.eq(to1e18(100))
      await expect(
        contracts.musdTester.connect(bob).transfer(alice, to1e18(101)),
      ).to.be.reverted
    })

    it("transfer(): transferring to a blacklisted address reverts", async () => {
      await expect(
        contracts.musdTester
          .connect(alice)
          .transfer(addresses.musdTester, to1e18(1)),
      ).to.be.reverted

      await expect(
        contracts.musdTester.connect(alice).transfer(ZERO_ADDRESS, to1e18(1)),
      ).to.be.reverted
    })
  })

  describe("Minting and Burning MUSD", () => {
    it("mint(): issues correct amount of tokens to the given address", async () => {
      const aliceBalanceBefore = await contracts.musdTester.balanceOf(alice)
      expect(aliceBalanceBefore).to.be.eq(to1e18(150))

      await contracts.musdTester.unprotectedMint(alice, to1e18(100))

      const aliceBalanceAfter = await contracts.musdTester.balanceOf(alice)
      await expect(aliceBalanceAfter).to.be.eq(to1e18(250))
    })

    it("burn(): burns correct amount of tokens from the given address", async () => {
      const aliceBalanceBefore = await contracts.musdTester.balanceOf(alice)
      expect(aliceBalanceBefore).to.be.eq(to1e18(150))

      await contracts.musdTester.unprotectedBurn(alice, to1e18(70))

      const aliceBalanceAfter = await contracts.musdTester.balanceOf(alice)
      expect(aliceBalanceAfter).to.be.eq(to1e18(80))
    })
  })

  describe("Role based access", () => {
    context("Adding New Collateral", () => {
      it("startAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester
            .connect(alice)
            .startAddContracts(
              addresses.newTroveManager,
              addresses.newStabilityPool,
              addresses.newBorrowerOperations,
            ),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startAddContracts(): reverts when provided addresses are not contracts", async () => {
        await expect(
          contracts.musdTester
            .connect(deployer)
            .startAddContracts(
              addresses.newTroveManager,
              addresses.newStabilityPool,
              alice.address,
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musdTester
            .connect(deployer)
            .startAddContracts(
              addresses.newTroveManager,
              alice.address,
              addresses.newBorrowerOperations,
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musdTester
            .connect(deployer)
            .startAddContracts(
              alice,
              addresses.newStabilityPool,
              addresses.newBorrowerOperations,
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musdTester
            .connect(deployer)
            .startAddContracts(
              addresses.newTroveManager,
              addresses.newStabilityPool,
              ZERO_ADDRESS,
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          contracts.musdTester
            .connect(deployer)
            .startAddContracts(
              addresses.newTroveManager,
              ZERO_ADDRESS,
              addresses.newBorrowerOperations,
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          contracts.musdTester
            .connect(deployer)
            .startAddContracts(
              ZERO_ADDRESS,
              addresses.newStabilityPool,
              addresses.newBorrowerOperations,
            ),
        ).to.be.revertedWith("Account cannot be zero address")
      })

      it("startAddContracts(): puts new set of contracts to pending list", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startAddContracts(
            addresses.newTroveManager,
            addresses.newStabilityPool,
            addresses.newBorrowerOperations,
          )
        const timeNow = await getLatestBlockTimestamp()
        expect(await contracts.musdTester.pendingTroveManager()).to.be.eq(
          addresses.newTroveManager,
        )
        expect(await contracts.musdTester.pendingStabilityPool()).to.be.eq(
          addresses.newStabilityPool,
        )
        expect(await contracts.musdTester.pendingBorrowerOperations()).to.be.eq(
          addresses.newBorrowerOperations,
        )
        expect(await contracts.musdTester.addContractsInitiated()).to.be.eq(
          timeNow,
        )

        expect(
          await contracts.musdTester.burnList(addresses.newTroveManager),
        ).to.equal(false)
        expect(
          await contracts.musdTester.burnList(addresses.newStabilityPool),
        ).to.equal(false)
        expect(
          await contracts.musdTester.burnList(addresses.newBorrowerOperations),
        ).to.equal(false)
        expect(
          await contracts.musdTester.mintList(addresses.newBorrowerOperations),
        ).to.equal(false)
      })

      it("cancelAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).cancelAddContracts(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelAddContracts(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).cancelAddContracts(),
        ).to.be.revertedWith("Adding contracts is not started")
      })

      it("cancelAddContracts(): cancels adding system contracts", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startAddContracts(
            addresses.newTroveManager,
            addresses.newStabilityPool,
            addresses.newBorrowerOperations,
          )

        await contracts.musdTester.connect(deployer).cancelAddContracts()

        expect(await contracts.musdTester.pendingTroveManager()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musdTester.pendingStabilityPool()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musdTester.pendingBorrowerOperations()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musdTester.addContractsInitiated()).to.be.eq(0)

        expect(
          await contracts.musdTester.burnList(addresses.newTroveManager),
        ).to.equal(false)
        expect(
          await contracts.musdTester.burnList(addresses.newStabilityPool),
        ).equal(false)
        expect(
          await contracts.musdTester.burnList(addresses.newBorrowerOperations),
        ).to.equal(false)
        expect(
          await contracts.musdTester.mintList(addresses.newBorrowerOperations),
        ).to.equal(false)
      })

      it("finalizeAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).finalizeAddContracts(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeAddContracts(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).finalizeAddContracts(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeAddContracts(): reverts when not enough time has passed", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startAddContracts(
            addresses.newTroveManager,
            addresses.newStabilityPool,
            addresses.newBorrowerOperations,
          )

        await expect(
          contracts.musdTester.connect(deployer).finalizeAddContracts(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeAddContracts(): enables new system contracts roles", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startAddContracts(
            addresses.newTroveManager,
            addresses.newStabilityPool,
            addresses.newBorrowerOperations,
          )
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        const tx = await contracts.musdTester
          .connect(deployer)
          .finalizeAddContracts()

        expect(await contracts.musdTester.pendingTroveManager()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musdTester.pendingStabilityPool()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musdTester.pendingBorrowerOperations()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musdTester.addContractsInitiated()).to.be.eq(0)

        expect(
          await contracts.musdTester.burnList(addresses.troveManager),
        ).to.equal(true)
        expect(
          await contracts.musdTester.burnList(addresses.newTroveManager),
        ).to.equal(true)
        expect(
          await contracts.musdTester.burnList(addresses.stabilityPool),
        ).to.equal(true)
        expect(
          await contracts.musdTester.burnList(addresses.newStabilityPool),
        ).to.equal(true)
        expect(
          await contracts.musdTester.burnList(addresses.newBorrowerOperations),
        ).to.equal(true)
        expect(
          await contracts.musdTester.burnList(addresses.borrowerOperations),
        ).to.equal(true)

        await expect(tx)
          .to.emit(contracts.musdTester, "TroveManagerAddressAdded")
          .withArgs(addresses.newTroveManager)
        await expect(tx)
          .to.emit(contracts.musdTester, "StabilityPoolAddressAdded")
          .withArgs(addresses.newStabilityPool)
        await expect(tx)
          .to.emit(contracts.musdTester, "BorrowerOperationsAddressAdded")
          .withArgs(addresses.newBorrowerOperations)
      })
    })

    context("Removing Mint Permissions", () => {
      it("startRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester
            .connect(alice)
            .startRevokeMintList(addresses.borrowerOperations),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startRevokeMintList(): reverts when account has no minting role", async () => {
        await expect(
          contracts.musdTester.connect(deployer).startRevokeMintList(alice),
        ).to.be.revertedWith("Incorrect address to revoke")
      })

      it("startRevokeMintList(): puts account to pending list", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeMintList(addresses.borrowerOperations)

        const timeNow = await getLatestBlockTimestamp()
        expect(
          await contracts.musdTester.pendingRevokedMintAddress(),
        ).to.be.equal(addresses.borrowerOperations)
        expect(
          await contracts.musdTester.revokeMintListInitiated(),
        ).to.be.equal(timeNow)
        expect(
          await contracts.musdTester.mintList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("cancelRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).cancelRevokeMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelRevokeMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).cancelRevokeMintList(),
        ).to.be.revertedWith("Revoking from mint list is not started")
      })

      it("cancelRevokeMintList(): cancels revoking from mint list", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeMintList(addresses.borrowerOperations)
        await contracts.musdTester.connect(deployer).cancelRevokeMintList()

        expect(
          await contracts.musdTester.pendingRevokedMintAddress(),
        ).to.be.equal(ZERO_ADDRESS)
        expect(
          await contracts.musdTester.revokeMintListInitiated(),
        ).to.be.equal(0)
        expect(
          await contracts.musdTester.mintList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("finalizeRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).finalizeRevokeMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeRevokeMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).finalizeRevokeMintList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeRevokeMintList(): reverts when passed not enough time", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeMintList(addresses.borrowerOperations)
        await expect(
          contracts.musdTester.connect(deployer).finalizeRevokeMintList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeRevokeMintList(): removes account from minting list", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeMintList(addresses.borrowerOperations)
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await contracts.musdTester.connect(deployer).finalizeRevokeMintList()

        expect(
          await contracts.musdTester.pendingRevokedMintAddress(),
        ).to.be.equal(ZERO_ADDRESS)
        expect(
          await contracts.musdTester.revokeMintListInitiated(),
        ).to.be.equal(0)
        expect(
          await contracts.musdTester.mintList(addresses.borrowerOperations),
        ).to.equal(false)
      })
    })

    context("Mintlist Changes", () => {
      it("startAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).startAddMintList(alice),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startAddMintList(): reverts when account already has minting role", async () => {
        await expect(
          contracts.musdTester
            .connect(deployer)
            .startAddMintList(addresses.borrowerOperations),
        ).to.be.revertedWith("Incorrect address to add")
      })

      it("startAddMintList(): puts account to pending list", async () => {
        await contracts.musdTester.connect(deployer).startAddMintList(alice)

        const timeNow = await getLatestBlockTimestamp()
        expect(
          await contracts.musdTester.pendingAddedMintAddress(),
        ).to.be.equal(alice)
        expect(await contracts.musdTester.addMintListInitiated()).to.be.equal(
          timeNow,
        )
        expect(await contracts.musdTester.mintList(alice)).to.equal(false)
      })

      it("cancelAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).cancelAddMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelAddMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).cancelAddMintList(),
        ).to.be.revertedWith("Adding to mint list is not started")
      })

      it("cancelAddMintList(): cancels adding to mint list", async () => {
        await contracts.musdTester.connect(deployer).startAddMintList(alice)
        await contracts.musdTester.connect(deployer).cancelAddMintList()

        expect(
          await contracts.musdTester.pendingAddedMintAddress(),
        ).to.be.equal(ZERO_ADDRESS)
        expect(await contracts.musdTester.addMintListInitiated()).to.be.equal(0)
        expect(await contracts.musdTester.mintList(alice)).to.equal(false)
      })

      it("finalizeAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).finalizeAddMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeAddMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).finalizeAddMintList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeAddMintList(): reverts when passed not enough time", async () => {
        await contracts.musdTester.connect(deployer).startAddMintList(alice)
        await expect(
          contracts.musdTester.connect(deployer).finalizeAddMintList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeAddMintList(): adds account to minting list", async () => {
        await contracts.musdTester.connect(deployer).startAddMintList(alice)
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await contracts.musdTester.connect(deployer).finalizeAddMintList()

        expect(
          await contracts.musdTester.pendingAddedMintAddress(),
        ).to.be.equal(ZERO_ADDRESS)
        expect(await contracts.musdTester.addMintListInitiated()).to.be.equal(0)
        expect(await contracts.musdTester.mintList(alice)).to.equal(true)
      })
    })

    context("Burnlist Changes", () => {
      it("startRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester
            .connect(alice)
            .startRevokeBurnList(addresses.borrowerOperations),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startRevokeBurnList(): reverts when account has no burning role", async () => {
        await expect(
          contracts.musdTester.connect(deployer).startRevokeBurnList(alice),
        ).to.be.revertedWith("Incorrect address to revoke")
      })

      it("startRevokeBurnList(): puts account to pending list", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeBurnList(addresses.borrowerOperations)

        const timeNow = await getLatestBlockTimestamp()
        expect(
          await contracts.musdTester.pendingRevokedBurnAddress(),
        ).to.be.equal(addresses.borrowerOperations)
        expect(
          await contracts.musdTester.revokeBurnListInitiated(),
        ).to.be.equal(timeNow)

        expect(
          await contracts.musdTester.burnList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("cancelRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).cancelRevokeBurnList(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelRevokeBurnList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).cancelRevokeBurnList(),
        ).to.be.revertedWith("Revoking from burn list is not started")
      })

      it("cancelRevokeBurnList(): cancels revoking from burn list", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeBurnList(addresses.borrowerOperations)
        await contracts.musdTester.connect(deployer).cancelRevokeBurnList()

        expect(
          await contracts.musdTester.pendingRevokedBurnAddress(),
        ).to.be.equal(ZERO_ADDRESS)
        expect(
          await contracts.musdTester.revokeBurnListInitiated(),
        ).to.be.equal(0)

        expect(
          await contracts.musdTester.burnList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("finalizeRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musdTester.connect(alice).finalizeRevokeBurnList(),
        ).to.be.revertedWithCustomError(
          contracts.musdTester,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeRevokeBurnList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musdTester.connect(deployer).finalizeRevokeBurnList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeRevokeBurnList(): reverts when passed not enough time", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeBurnList(addresses.borrowerOperations)
        await expect(
          contracts.musdTester.connect(deployer).finalizeRevokeBurnList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeRevokeBurnList(): removes account from minting list", async () => {
        await contracts.musdTester
          .connect(deployer)
          .startRevokeBurnList(addresses.borrowerOperations)
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await contracts.musdTester.connect(deployer).finalizeRevokeBurnList()

        expect(
          await contracts.musdTester.pendingRevokedBurnAddress(),
        ).to.be.equal(ZERO_ADDRESS)
        expect(
          await contracts.musdTester.revokeBurnListInitiated(),
        ).to.be.equal(0)

        expect(
          await contracts.musdTester.burnList(addresses.borrowerOperations),
        ).to.equal(false)
      })
    })
  })
})
