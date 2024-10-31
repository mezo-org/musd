import { ethers } from "hardhat"
import { expect, assert } from "chai"
import {
  Contracts,
  TestSetup,
  getLatestBlockTimestamp,
  fastForwardTime,
  connectContracts,
  getAddresses,
  TestingAddresses,
  User,
  loadTestSetup,
} from "./helpers"
import { to1e18, ZERO_ADDRESS, GOVERNANCE_TIME_DELAY } from "./utils"
import { BorrowerOperations, TroveManager } from "../typechain"
import { StabilityPool } from "../typechain/contracts/StabilityPool"

describe("MUSD", () => {
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let deployer: User
  let contracts: Contracts
  let testSetup: TestSetup
  let addresses: TestingAddresses
  let newBorrowerOperations: BorrowerOperations
  let newStabilityPool: StabilityPool
  let newTroveManager: TroveManager

  beforeEach(async () => {
    testSetup = await loadTestSetup()
    contracts = testSetup.contracts
    await connectContracts(contracts, testSetup.users)

    // new contracts to add.
    newBorrowerOperations = await (
      await ethers.getContractFactory("BorrowerOperations")
    ).deploy()
    newStabilityPool = await (
      await ethers.getContractFactory("StabilityPool")
    ).deploy()
    newTroveManager = await (
      await ethers.getContractFactory("TroveManager")
    ).deploy()

    // users
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    dennis = testSetup.users.dennis
    deployer = testSetup.users.deployer

    // Mint using tester functions.
    await contracts.musd.unprotectedMint(alice.wallet, to1e18(150))
    await contracts.musd.unprotectedMint(bob.wallet, to1e18(100))
    await contracts.musd.unprotectedMint(carol.wallet, to1e18(50))

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
      let balance = await contracts.musd.balanceOf(alice.wallet)
      expect(balance).to.be.eq(to1e18(150))

      balance = await contracts.musd.balanceOf(bob.wallet)
      expect(balance).to.be.eq(to1e18(100))

      balance = await contracts.musd.balanceOf(carol.wallet)
      expect(balance).to.be.eq(to1e18(50))

      balance = await contracts.musd.balanceOf(dennis.wallet)
      expect(balance).to.be.eq(to1e18(0))
    })

    it("totalSupply(): gets the total supply", async () => {
      const total = await contracts.musd.totalSupply()
      expect(total).to.be.eq(to1e18(300))
    })

    it("Initial set of contracts was set correctly", async () => {
      expect(await contracts.musd.burnList(addresses.troveManager)).to.equal(
        true,
      )

      expect(await contracts.musd.burnList(addresses.stabilityPool)).to.equal(
        true,
      )

      expect(
        await contracts.musd.burnList(addresses.borrowerOperations),
      ).to.equal(true)

      expect(await contracts.musd.burnList(deployer.wallet)).to.equal(false)
    })
  })

  describe("Approving MUSD", () => {
    it("allowance(): returns an account's spending allowance for another account's balance", async () => {
      await contracts.musd
        .connect(bob.wallet)
        .approve(alice.wallet, to1e18(100))

      const allowanceA = await contracts.musd.allowance(
        bob.wallet,
        alice.wallet,
      )
      const allowanceD = await contracts.musd.allowance(
        bob.wallet,
        dennis.wallet,
      )

      expect(allowanceA).to.be.eq(to1e18(100))
      expect(allowanceD).to.be.eq(to1e18(0))
    })

    it("approve(): approves an account to spend the specified amount", async () => {
      const allowanceABefore = await contracts.musd.allowance(
        bob.wallet,
        alice.wallet,
      )
      expect(allowanceABefore).to.be.eq(to1e18(0))

      await contracts.musd
        .connect(bob.wallet)
        .approve(alice.wallet, to1e18(100))

      const allowanceAAfter = await contracts.musd.allowance(
        bob.wallet,
        alice.wallet,
      )
      expect(allowanceAAfter).to.be.eq(to1e18(100))
    })

    it("approve(): reverts when spender param is address(0)", async () => {
      await expect(
        contracts.musd.connect(bob.wallet).approve(ZERO_ADDRESS, to1e18(100)),
      ).to.be.reverted
    })

    it("approve(): reverts when owner param is address(0)", async () => {
      if ("callInternalApprove" in contracts.musd) {
        await expect(
          contracts.musd
            .connect(bob.wallet)
            .callInternalApprove(ZERO_ADDRESS, alice.wallet, to1e18(1000)),
        ).to.be.reverted
      } else {
        assert.fail("MUSDTester not loaded in contracts.musd")
      }
    })
  })

  describe("Transferring MUSD", () => {
    it("transferFrom(): successfully transfers from an account which is it approved to transfer from", async () => {
      const allowanceA0 = await contracts.musd.allowance(
        bob.wallet,
        alice.wallet,
      )
      expect(allowanceA0).to.be.eq(to1e18(0))

      await contracts.musd.connect(bob.wallet).approve(alice.wallet, to1e18(50))

      // Check A's allowance of Bob's funds has increased
      const allowanceA1 = await contracts.musd.allowance(
        bob.wallet,
        alice.wallet,
      )
      expect(allowanceA1).to.be.eq(to1e18(50))

      expect(await contracts.musd.balanceOf(carol.wallet)).to.be.eq(to1e18(50))

      // Alice transfers from bob to Carol, using up her allowance
      await contracts.musd
        .connect(alice.wallet)
        .transferFrom(bob.wallet, carol.wallet, to1e18(50))
      expect(await contracts.musd.balanceOf(carol.wallet)).to.be.eq(to1e18(100))

      // Check A's allowance of Bob's funds has decreased
      const allowanceA2 = await contracts.musd.allowance(
        bob.wallet,
        alice.wallet,
      )
      expect(allowanceA2).to.be.eq(to1e18(0))

      // Check bob's balance has decreased
      expect(await contracts.musd.balanceOf(bob.wallet)).to.be.eq(to1e18(50))

      // Alice tries to transfer more tokens from bob's account to carol than she's allowed
      await expect(
        contracts.musd
          .connect(alice.wallet)
          .transferFrom(bob.wallet, carol.wallet, to1e18(50)),
      ).to.be.reverted
    })

    it("transfer(): increases the recipient's balance by the correct amount", async () => {
      expect(await contracts.musd.balanceOf(alice.wallet)).to.be.eq(to1e18(150))

      await contracts.musd
        .connect(bob.wallet)
        .transfer(alice.wallet, to1e18(37), { from: bob.wallet })

      expect(await contracts.musd.balanceOf(alice.wallet)).to.be.eq(to1e18(187))
    })

    it("transfer(): reverts if amount exceeds sender's balance", async () => {
      expect(await contracts.musd.balanceOf(bob.wallet)).to.be.eq(to1e18(100))
      await expect(
        contracts.musd.connect(bob.wallet).transfer(alice.wallet, to1e18(101)),
      ).to.be.reverted
    })

    it("transfer(): transferring to a blacklisted address reverts", async () => {
      await expect(
        contracts.musd
          .connect(alice.wallet)
          .transfer(addresses.musd, to1e18(1)),
      ).to.be.reverted

      await expect(
        contracts.musd.connect(alice.wallet).transfer(ZERO_ADDRESS, to1e18(1)),
      ).to.be.reverted
    })
  })

  describe("Minting and Burning MUSD", () => {
    it("mint(): issues correct amount of tokens to the given address", async () => {
      alice.musd.before = await contracts.musd.balanceOf(alice.wallet)
      expect(alice.musd.before).to.be.eq(to1e18(150))

      await contracts.musd.unprotectedMint(alice.wallet, to1e18(100))

      alice.musd.after = await contracts.musd.balanceOf(alice.wallet)
      await expect(alice.musd.after).to.be.eq(to1e18(250))
    })

    it("burn(): burns correct amount of tokens from the given address", async () => {
      alice.musd.before = await contracts.musd.balanceOf(alice.wallet)
      expect(alice.musd.before).to.be.eq(to1e18(150))

      if ("unprotectedBurn" in contracts.musd) {
        await contracts.musd.unprotectedBurn(alice.wallet, to1e18(70))
      } else {
        assert.fail("MUSDTester not loaded in contracts.musd")
      }

      alice.musd.after = await contracts.musd.balanceOf(alice.wallet)
      expect(alice.musd.after).to.be.eq(to1e18(80))
    })
  })

  describe("Role based access", () => {
    context("Adding New Collateral", () => {
      it("startAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd
            .connect(alice.wallet)
            .startAddContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startAddContracts(): reverts when provided addresses are not contracts", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startAddContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              alice.address,
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startAddContracts(
              await newTroveManager.getAddress(),
              alice.address,
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startAddContracts(
              alice.wallet,
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startAddContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              ZERO_ADDRESS,
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startAddContracts(
              await newTroveManager.getAddress(),
              ZERO_ADDRESS,
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startAddContracts(
              ZERO_ADDRESS,
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account cannot be zero address")
      })

      it("startAddContracts(): puts new set of contracts to pending list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddContracts(
            await newTroveManager.getAddress(),
            await newStabilityPool.getAddress(),
            await newBorrowerOperations.getAddress(),
          )
        const timeNow = await getLatestBlockTimestamp()
        expect(await contracts.musd.pendingTroveManager()).to.be.eq(
          await newTroveManager.getAddress(),
        )
        expect(await contracts.musd.pendingStabilityPool()).to.be.eq(
          await newStabilityPool.getAddress(),
        )
        expect(await contracts.musd.pendingBorrowerOperations()).to.be.eq(
          await newBorrowerOperations.getAddress(),
        )
        expect(await contracts.musd.addContractsInitiated()).to.be.eq(timeNow)

        expect(
          await contracts.musd.burnList(await newTroveManager.getAddress()),
        ).to.equal(false)
        expect(
          await contracts.musd.burnList(await newStabilityPool.getAddress()),
        ).to.equal(false)
        expect(
          await contracts.musd.burnList(
            await newBorrowerOperations.getAddress(),
          ),
        ).to.equal(false)
        expect(
          await contracts.musd.mintList(
            await newBorrowerOperations.getAddress(),
          ),
        ).to.equal(false)
      })

      it("cancelAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).cancelAddContracts(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelAddContracts(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).cancelAddContracts(),
        ).to.be.revertedWith("Adding contracts is not started")
      })

      it("cancelAddContracts(): cancels adding system contracts", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddContracts(
            await newTroveManager.getAddress(),
            await newStabilityPool.getAddress(),
            await newBorrowerOperations.getAddress(),
          )

        await contracts.musd.connect(deployer.wallet).cancelAddContracts()

        expect(await contracts.musd.pendingTroveManager()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.pendingStabilityPool()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.pendingBorrowerOperations()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.addContractsInitiated()).to.be.eq(0)

        expect(
          await contracts.musd.burnList(await newTroveManager.getAddress()),
        ).to.equal(false)
        expect(
          await contracts.musd.burnList(await newStabilityPool.getAddress()),
        ).equal(false)
        expect(
          await contracts.musd.burnList(
            await newBorrowerOperations.getAddress(),
          ),
        ).to.equal(false)
        expect(
          await contracts.musd.mintList(
            await newBorrowerOperations.getAddress(),
          ),
        ).to.equal(false)
      })

      it("finalizeAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).finalizeAddContracts(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeAddContracts(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).finalizeAddContracts(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeAddContracts(): reverts when not enough time has passed", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddContracts(
            await newTroveManager.getAddress(),
            await newStabilityPool.getAddress(),
            await newBorrowerOperations.getAddress(),
          )

        await expect(
          contracts.musd.connect(deployer.wallet).finalizeAddContracts(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeAddContracts(): enables new system contracts roles", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddContracts(
            await newTroveManager.getAddress(),
            await newStabilityPool.getAddress(),
            await newBorrowerOperations.getAddress(),
          )
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        const tx = await contracts.musd
          .connect(deployer.wallet)
          .finalizeAddContracts()

        expect(await contracts.musd.pendingTroveManager()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.pendingStabilityPool()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.pendingBorrowerOperations()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.addContractsInitiated()).to.be.eq(0)

        expect(await contracts.musd.burnList(addresses.troveManager)).to.equal(
          true,
        )
        expect(
          await contracts.musd.burnList(await newTroveManager.getAddress()),
        ).to.equal(true)
        expect(await contracts.musd.burnList(addresses.stabilityPool)).to.equal(
          true,
        )
        expect(
          await contracts.musd.burnList(await newStabilityPool.getAddress()),
        ).to.equal(true)
        expect(
          await contracts.musd.burnList(
            await newBorrowerOperations.getAddress(),
          ),
        ).to.equal(true)
        expect(
          await contracts.musd.burnList(addresses.borrowerOperations),
        ).to.equal(true)

        await expect(tx)
          .to.emit(contracts.musd, "TroveManagerAddressAdded")
          .withArgs(await newTroveManager.getAddress())
        await expect(tx)
          .to.emit(contracts.musd, "StabilityPoolAddressAdded")
          .withArgs(await newStabilityPool.getAddress())
        await expect(tx)
          .to.emit(contracts.musd, "BorrowerOperationsAddressAdded")
          .withArgs(await newBorrowerOperations.getAddress())
      })
    })

    context("Removing Mint Permissions", () => {
      it("startRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd
            .connect(alice.wallet)
            .startRevokeMintList(addresses.borrowerOperations),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startRevokeMintList(): reverts when account has no minting role", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startRevokeMintList(alice.wallet),
        ).to.be.revertedWith("Incorrect address to revoke")
      })

      it("startRevokeMintList(): puts account to pending list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeMintList(addresses.borrowerOperations)

        const timeNow = await getLatestBlockTimestamp()
        expect(await contracts.musd.pendingRevokedMintAddress()).to.be.equal(
          addresses.borrowerOperations,
        )
        expect(await contracts.musd.revokeMintListInitiated()).to.be.equal(
          timeNow,
        )
        expect(
          await contracts.musd.mintList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("cancelRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).cancelRevokeMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelRevokeMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).cancelRevokeMintList(),
        ).to.be.revertedWith("Revoking from mint list is not started")
      })

      it("cancelRevokeMintList(): cancels revoking from mint list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeMintList(addresses.borrowerOperations)
        await contracts.musd.connect(deployer.wallet).cancelRevokeMintList()

        expect(await contracts.musd.pendingRevokedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.revokeMintListInitiated()).to.be.equal(0)
        expect(
          await contracts.musd.mintList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("finalizeRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).finalizeRevokeMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeRevokeMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).finalizeRevokeMintList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeRevokeMintList(): reverts when passed not enough time", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeMintList(addresses.borrowerOperations)
        await expect(
          contracts.musd.connect(deployer.wallet).finalizeRevokeMintList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeRevokeMintList(): removes account from minting list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeMintList(addresses.borrowerOperations)
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await contracts.musd.connect(deployer.wallet).finalizeRevokeMintList()

        expect(await contracts.musd.pendingRevokedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.revokeMintListInitiated()).to.be.equal(0)
        expect(
          await contracts.musd.mintList(addresses.borrowerOperations),
        ).to.equal(false)
      })
    })

    context("Mintlist Changes", () => {
      it("startAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).startAddMintList(alice.wallet),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startAddMintList(): reverts when account already has minting role", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startAddMintList(addresses.borrowerOperations),
        ).to.be.revertedWith("Incorrect address to add")
      })

      it("startAddMintList(): puts account to pending list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddMintList(alice.wallet)

        const timeNow = await getLatestBlockTimestamp()
        expect(await contracts.musd.pendingAddedMintAddress()).to.be.equal(
          alice.wallet,
        )
        expect(await contracts.musd.addMintListInitiated()).to.be.equal(timeNow)
        expect(await contracts.musd.mintList(alice.wallet)).to.equal(false)
      })

      it("cancelAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).cancelAddMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelAddMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).cancelAddMintList(),
        ).to.be.revertedWith("Adding to mint list is not started")
      })

      it("cancelAddMintList(): cancels adding to mint list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddMintList(alice.wallet)
        await contracts.musd.connect(deployer.wallet).cancelAddMintList()

        expect(await contracts.musd.pendingAddedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.addMintListInitiated()).to.be.equal(0)
        expect(await contracts.musd.mintList(alice.wallet)).to.equal(false)
      })

      it("finalizeAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).finalizeAddMintList(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeAddMintList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).finalizeAddMintList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeAddMintList(): reverts when passed not enough time", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddMintList(alice.wallet)
        await expect(
          contracts.musd.connect(deployer.wallet).finalizeAddMintList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeAddMintList(): adds account to minting list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startAddMintList(alice.wallet)
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await contracts.musd.connect(deployer.wallet).finalizeAddMintList()

        expect(await contracts.musd.pendingAddedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.addMintListInitiated()).to.be.equal(0)
        expect(await contracts.musd.mintList(alice.wallet)).to.equal(true)
      })
    })

    context("Burnlist Changes", () => {
      it("startRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd
            .connect(alice.wallet)
            .startRevokeBurnList(addresses.borrowerOperations),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("startRevokeBurnList(): reverts when account has no burning role", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .startRevokeBurnList(alice.wallet),
        ).to.be.revertedWith("Incorrect address to revoke")
      })

      it("startRevokeBurnList(): puts account to pending list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeBurnList(addresses.borrowerOperations)

        const timeNow = await getLatestBlockTimestamp()
        expect(await contracts.musd.pendingRevokedBurnAddress()).to.be.equal(
          addresses.borrowerOperations,
        )
        expect(await contracts.musd.revokeBurnListInitiated()).to.be.equal(
          timeNow,
        )

        expect(
          await contracts.musd.burnList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("cancelRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).cancelRevokeBurnList(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("cancelRevokeBurnList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).cancelRevokeBurnList(),
        ).to.be.revertedWith("Revoking from burn list is not started")
      })

      it("cancelRevokeBurnList(): cancels revoking from burn list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeBurnList(addresses.borrowerOperations)
        await contracts.musd.connect(deployer.wallet).cancelRevokeBurnList()

        expect(await contracts.musd.pendingRevokedBurnAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.revokeBurnListInitiated()).to.be.equal(0)

        expect(
          await contracts.musd.burnList(addresses.borrowerOperations),
        ).to.equal(true)
      })

      it("finalizeRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).finalizeRevokeBurnList(),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("finalizeRevokeBurnList(): reverts when change is not initiated", async () => {
        await expect(
          contracts.musd.connect(deployer.wallet).finalizeRevokeBurnList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeRevokeBurnList(): reverts when passed not enough time", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeBurnList(addresses.borrowerOperations)
        await expect(
          contracts.musd.connect(deployer.wallet).finalizeRevokeBurnList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeRevokeBurnList(): removes account from minting list", async () => {
        await contracts.musd
          .connect(deployer.wallet)
          .startRevokeBurnList(addresses.borrowerOperations)
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await contracts.musd.connect(deployer.wallet).finalizeRevokeBurnList()

        expect(await contracts.musd.pendingRevokedBurnAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await contracts.musd.revokeBurnListInitiated()).to.be.equal(0)

        expect(
          await contracts.musd.burnList(addresses.borrowerOperations),
        ).to.equal(false)
      })
    })
  })
})
