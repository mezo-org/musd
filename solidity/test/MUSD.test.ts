import { ethers } from "hardhat"
import { expect, assert } from "chai"
import {
  Contracts,
  TestingAddresses,
  User,
  getDeployedContract,
  setupTests,
} from "./helpers"
import { to1e18 } from "./utils"
import {
  BorrowerOperations,
  InterestRateManager,
  TroveManager,
} from "../typechain"
import { StabilityPool } from "../typechain/contracts/StabilityPool"
import { ZERO_ADDRESS } from "../helpers/constants"

describe("MUSD", () => {
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let deployer: User
  let contracts: Contracts
  let addresses: TestingAddresses
  let newBorrowerOperations: BorrowerOperations
  let newInterestRateManager: InterestRateManager
  let newStabilityPool: StabilityPool
  let newTroveManager: TroveManager

  beforeEach(async () => {
    ;({ alice, bob, carol, dennis, deployer, contracts, addresses } =
      await setupTests())

    newBorrowerOperations = await getDeployedContract("NewBorrowerOperations")

    newInterestRateManager = await (
      await ethers.getContractFactory("InterestRateManager")
    ).deploy()
    newStabilityPool = await (
      await ethers.getContractFactory("StabilityPool")
    ).deploy()
    newTroveManager = await (
      await ethers.getContractFactory("TroveManager")
    ).deploy()

    // Mint using tester functions.
    await contracts.musd.unprotectedMint(alice.wallet, to1e18(150))
    await contracts.musd.unprotectedMint(bob.wallet, to1e18(100))
    await contracts.musd.unprotectedMint(carol.wallet, to1e18(50))
  })

  describe("initialize", () => {
    it("reverts as already initialized", async () => {
      await expect(
        contracts.musd
          .connect(deployer.wallet)
          .initialize(
            newTroveManager,
            newStabilityPool,
            newBorrowerOperations,
            newInterestRateManager,
          ),
      ).to.be.revertedWith("Already initialized")
    })
  })

  describe("name()", () => {
    it("returns the token's name", async () => {
      expect(await contracts.musd.name()).to.equal("Mezo USD")
    })
  })

  describe("symbol()", () => {
    it("returns the token's symbol", async () => {
      expect(await contracts.musd.symbol()).to.equal("MUSD")
    })
  })

  describe("decimals()", () => {
    it("returns the token's decimals", async () => {
      expect(await contracts.musd.decimals()).to.equal("18")
    })
  })

  describe("balanceOf()", () => {
    it("gets the balance of the account", async () => {
      let balance = await contracts.musd.balanceOf(alice.wallet)
      expect(balance).to.be.eq(to1e18(150))

      balance = await contracts.musd.balanceOf(bob.wallet)
      expect(balance).to.be.eq(to1e18(100))

      balance = await contracts.musd.balanceOf(carol.wallet)
      expect(balance).to.be.eq(to1e18(50))

      balance = await contracts.musd.balanceOf(dennis.wallet)
      expect(balance).to.be.eq(to1e18(0))
    })
  })

  describe("totalSupply()", () => {
    it("gets the total supply", async () => {
      const total = await contracts.musd.totalSupply()
      expect(total).to.be.eq(to1e18(300))
    })
  })

  describe("burnList()", () => {
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

  describe("allowance()", () => {
    it("returns an account's spending allowance for another account's balance", async () => {
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
  })

  describe("approve()", () => {
    it("approves an account to spend the specified amount", async () => {
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

    it("reverts when spender param is address(0)", async () => {
      await expect(
        contracts.musd.connect(bob.wallet).approve(ZERO_ADDRESS, to1e18(100)),
      ).to.be.reverted
    })

    context("Expected Reverts", () => {
      it("reverts when owner param is address(0)", async () => {
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
  })

  describe("transferFrom()", () => {
    it("successfully transfers from an account which is it approved to transfer from", async () => {
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
  })

  describe("transfer()", () => {
    it("increases the recipient's balance by the correct amount", async () => {
      expect(await contracts.musd.balanceOf(alice.wallet)).to.be.eq(to1e18(150))

      await contracts.musd
        .connect(bob.wallet)
        .transfer(alice.wallet, to1e18(37), { from: bob.wallet })

      expect(await contracts.musd.balanceOf(alice.wallet)).to.be.eq(to1e18(187))
    })

    context("Expected Reverts", () => {
      it("reverts if amount exceeds sender's balance", async () => {
        expect(await contracts.musd.balanceOf(bob.wallet)).to.be.eq(to1e18(100))
        await expect(
          contracts.musd
            .connect(bob.wallet)
            .transfer(alice.wallet, to1e18(101)),
        ).to.be.reverted
      })

      it("reverts when transferring to a blacklisted address", async () => {
        await expect(
          contracts.musd
            .connect(alice.wallet)
            .transfer(addresses.musd, to1e18(1)),
        ).to.be.reverted

        await expect(
          contracts.musd
            .connect(alice.wallet)
            .transfer(ZERO_ADDRESS, to1e18(1)),
        ).to.be.reverted
      })
    })
  })

  describe("mint()", () => {
    it("issues correct amount of tokens to the given address", async () => {
      alice.musd.before = await contracts.musd.balanceOf(alice.wallet)
      expect(alice.musd.before).to.be.eq(to1e18(150))

      await contracts.musd.unprotectedMint(alice.wallet, to1e18(100))

      alice.musd.after = await contracts.musd.balanceOf(alice.wallet)
      await expect(alice.musd.after).to.be.eq(to1e18(250))
    })
  })

  describe("burn()", () => {
    it("burns correct amount of tokens from the given address", async () => {
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

  describe("addToMintList()", () => {
    context("Expected Reverts", () => {
      it("reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).addToMintList(alice.wallet),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("reverts when account already has minting role", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .addToMintList(addresses.borrowerOperations),
        ).to.be.revertedWithCustomError(contracts.musd, "AddressHasMintRole")
      })
    })

    it("adds account to minting list", async () => {
      const tx = await contracts.musd
        .connect(deployer.wallet)
        .addToMintList(alice.wallet)

      expect(await contracts.musd.mintList(alice.wallet)).to.equal(true)
      await expect(tx)
        .to.emit(contracts.musd, "MintListAddressAdded")
        .withArgs(alice.wallet)
    })
  })

  describe("removeFromMintList()", () => {
    context("Expected Reverts", () => {
      it("reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).removeFromMintList(alice.wallet),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("reverts when account has no minting role", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .removeFromMintList(alice.wallet),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "AddressWithoutMintRole",
        )
      })
    })

    it("removes account from minting list", async () => {
      await contracts.musd.connect(deployer.wallet).addToMintList(alice.wallet)

      const tx = await contracts.musd
        .connect(deployer.wallet)
        .removeFromMintList(alice.wallet)

      expect(await contracts.musd.mintList(alice.wallet)).to.equal(false)
      await expect(tx)
        .to.emit(contracts.musd, "MintListAddressRemoved")
        .withArgs(alice.wallet)
    })
  })

  describe("addToBurnList()", () => {
    context("Expected Reverts", () => {
      it("reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).addToBurnList(alice.wallet),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("reverts when account already has burn role", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .addToBurnList(addresses.borrowerOperations),
        ).to.be.revertedWithCustomError(contracts.musd, "AddressHasBurnRole")
      })
    })

    it("adds account to burn list", async () => {
      const tx = await contracts.musd
        .connect(deployer.wallet)
        .addToBurnList(alice.wallet)

      expect(await contracts.musd.burnList(alice.wallet)).to.equal(true)
      await expect(tx)
        .to.emit(contracts.musd, "BurnListAddressAdded")
        .withArgs(alice.wallet)
    })
  })

  describe("removeFromBurnList()", () => {
    context("Expected Reverts", () => {
      it("reverts when caller is not owner", async () => {
        await expect(
          contracts.musd.connect(alice.wallet).removeFromBurnList(alice.wallet),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("reverts when account has no burn role", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .removeFromBurnList(alice.wallet),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "AddressWithoutBurnRole",
        )
      })
    })

    it("removes account from burn list", async () => {
      await contracts.musd.connect(deployer.wallet).addToBurnList(alice.wallet)

      const tx = await contracts.musd
        .connect(deployer.wallet)
        .removeFromBurnList(alice.wallet)

      expect(await contracts.musd.burnList(alice.wallet)).to.equal(false)
      await expect(tx)
        .to.emit(contracts.musd, "BurnListAddressRemoved")
        .withArgs(alice.wallet)
    })
  })

  describe("setSystemContracts()", () => {
    context("Expected reverts", () => {
      it("reverts when caller is not owner", async () => {
        await expect(
          contracts.musd
            .connect(alice.wallet)
            .setSystemContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
              await newInterestRateManager.getAddress(),
            ),
        ).to.be.revertedWithCustomError(
          contracts.musd,
          "OwnableUnauthorizedAccount",
        )
      })

      it("reverts when provided address is not contract", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              alice.wallet,
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
              await newInterestRateManager.getAddress(),
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              await newTroveManager.getAddress(),
              alice.address,
              await newBorrowerOperations.getAddress(),
              await newInterestRateManager.getAddress(),
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              alice.address,
              await newInterestRateManager.getAddress(),
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
              alice.address,
            ),
        ).to.be.revertedWith("Account code size cannot be zero")
      })

      it("reverts when provided address is zero address", async () => {
        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              ZERO_ADDRESS,
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
              await newInterestRateManager.getAddress(),
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              await newTroveManager.getAddress(),
              ZERO_ADDRESS,
              await newBorrowerOperations.getAddress(),
              await newInterestRateManager.getAddress(),
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              ZERO_ADDRESS,
              await newInterestRateManager.getAddress(),
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          contracts.musd
            .connect(deployer.wallet)
            .setSystemContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
              ZERO_ADDRESS,
            ),
        ).to.be.revertedWith("Account cannot be zero address")
      })
    })

    it("enables new system contracts roles", async () => {
      const tx = await contracts.musd
        .connect(deployer.wallet)
        .setSystemContracts(
          await newTroveManager.getAddress(),
          await newStabilityPool.getAddress(),
          await newBorrowerOperations.getAddress(),
          await newInterestRateManager.getAddress(),
        )

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
        await contracts.musd.burnList(await newBorrowerOperations.getAddress()),
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
      await expect(tx)
        .to.emit(contracts.musd, "InterestRateManagerAddressAdded")
        .withArgs(await newInterestRateManager.getAddress())

      await expect(tx)
        .to.emit(contracts.musd, "MintListAddressAdded")
        .withArgs(await newBorrowerOperations.getAddress())
      await expect(tx)
        .to.emit(contracts.musd, "MintListAddressAdded")
        .withArgs(await newInterestRateManager.getAddress())
      await expect(tx)
        .to.emit(contracts.musd, "BurnListAddressAdded")
        .withArgs(await newTroveManager.getAddress())
      await expect(tx)
        .to.emit(contracts.musd, "BurnListAddressAdded")
        .withArgs(await newStabilityPool.getAddress())
      await expect(tx)
        .to.emit(contracts.musd, "BurnListAddressAdded")
        .withArgs(await newBorrowerOperations.getAddress())
    })
  })
})
