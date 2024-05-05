import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { ethers, helpers } from "hardhat"
import { expect } from "chai"
import { deployment } from "./helpers"
import {
  BorrowerOperations,
  MUSD,
  MUSDTester,
  StabilityPool,
  TroveManager,
} from "../typechain"
import { to1e18 } from "./utils"

async function getLatestBlockTimestamp() {
  const { provider } = ethers
  const latestBlock = await provider.getBlock("latest")

  if (latestBlock) {
    return latestBlock.timestamp
  }
  // console.error("Failed to fetch latest block")
  return null
}

async function fastForwardTime(seconds: number): Promise<void> {
  const { provider } = ethers
  await provider.send("evm_increaseTime", [seconds])
  await provider.send("evm_mine", [])
}

async function fixture() {
  const {
    musd,
    musdTester,
    troveManager,
    borrowerOperations,
    stabilityPool,
    newTroveManager,
    newBorrowerOperations,
    newStabilityPool,
  } = await deployment()
  const { deployer } = await helpers.signers.getNamedSigners()
  const [alice, bob, carol, dennis] = await helpers.signers.getUnnamedSigners()

  return {
    alice,
    bob,
    carol,
    dennis,
    deployer,
    musd,
    musdTester,
    troveManager,
    borrowerOperations,
    stabilityPool,
    newTroveManager,
    newBorrowerOperations,
    newStabilityPool,
  }
}

describe("MUSD", () => {
  const GOVERNANCE_TIME_DELAY = 90 * 24 * 60 * 60 // 90 days in seconds
  const ZERO_ADDRESS = `0x${"0".repeat(40)}`

  // contracts
  let musd: MUSD
  let musdTester: MUSDTester
  let troveManager: TroveManager
  let borrowerOperations: BorrowerOperations
  let stabilityPool: StabilityPool
  let newTroveManager: TroveManager
  let newBorrowerOperations: BorrowerOperations
  let newStabilityPool: StabilityPool

  // users
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let dennis: HardhatEthersSigner
  let deployer: HardhatEthersSigner

  beforeEach(async () => {
    ;({
      alice,
      bob,
      carol,
      dennis,
      deployer,
      musd,
      musdTester,
      troveManager,
      borrowerOperations,
      stabilityPool,
      newTroveManager,
      newBorrowerOperations,
      newStabilityPool,
    } = await loadFixture(fixture))

    await musdTester.unprotectedMint(alice, to1e18(150))
    await musdTester.unprotectedMint(bob, to1e18(100))
    await musdTester.unprotectedMint(carol, to1e18(50))
  })

  describe("Initial State", () => {
    it("name(): returns the token's name", async () => {
      expect(await musd.name()).to.equal("Mezo USD")
    })

    it("symbol(): returns the token's symbol", async () => {
      expect(await musd.symbol()).to.equal("MUSD")
    })

    it("decimals(): returns the token's decimals", async () => {
      expect(await musd.decimals()).to.equal("18")
    })

    it("balanceOf(): gets the balance of the account", async () => {
      let balance = await musdTester.balanceOf(alice)
      expect(balance).to.be.eq(to1e18(150))

      balance = await musdTester.balanceOf(bob)
      expect(balance).to.be.eq(to1e18(100))

      balance = await musdTester.balanceOf(carol)
      expect(balance).to.be.eq(to1e18(50))
    })

    it("totalSupply(): gets the total supply", async () => {
      const total = await musdTester.totalSupply()
      expect(total).to.be.eq(to1e18(300))
    })

    it("Initial set of contracts was set correctly", async () => {
      expect(
        await musdTester.burnList(await troveManager.getAddress()),
      ).to.equal(true)
      expect(
        await musdTester.burnList(await stabilityPool.getAddress()),
      ).to.equal(true)
      expect(
        await musdTester.burnList(await borrowerOperations.getAddress()),
      ).to.equal(true)
      expect(await musdTester.burnList(deployer)).to.equal(false)
    })
  })

  describe("Approving MUSD", () => {
    it("allowance(): returns an account's spending allowance for another account's balance", async () => {
      await musdTester.connect(bob).approve(alice, to1e18(100))

      const allowanceA = await musdTester.allowance(bob, alice)
      const allowanceD = await musdTester.allowance(bob, dennis)

      expect(allowanceA).to.be.eq(to1e18(100))
      expect(allowanceD).to.be.eq(to1e18(0))
    })

    it("approve(): approves an account to spend the specified amount", async () => {
      const allowanceABefore = await musdTester.allowance(bob, alice)
      expect(allowanceABefore).to.be.eq(to1e18(0))

      await musdTester.connect(bob).approve(alice, to1e18(100))

      const allowanceAAfter = await musdTester.allowance(bob, alice)
      expect(allowanceAAfter).to.be.eq(to1e18(100))
    })

    it("approve(): reverts when spender param is address(0)", async () => {
      await expect(musdTester.connect(bob).approve(ZERO_ADDRESS, to1e18(100)))
        .to.be.reverted
    })

    it("approve(): reverts when owner param is address(0)", async () => {
      await expect(
        musdTester
          .connect(bob)
          .callInternalApprove(ZERO_ADDRESS, alice, to1e18(1000)),
      ).to.be.reverted
    })

    it("increaseAllowance(): increases an account's allowance by the correct amount", async () => {
      const allowanceABefore = await musdTester.allowance(bob, alice)
      expect(allowanceABefore).to.be.eq(to1e18("0"))

      await musdTester.connect(bob).increaseAllowance(alice, to1e18(100))

      const allowanceAAfter = await musdTester.allowance(bob, alice)
      expect(allowanceAAfter).to.be.eq(to1e18(100))
    })

    it("decreaseAllowance(): decreases allowance by the expected amount", async () => {
      await musdTester.approve(bob, to1e18(3))
      expect(await musdTester.allowance(alice, bob)).to.be.eq(to1e18(3))
      await musdTester.decreaseAllowance(bob, to1e18(1), { from: alice })
      expect(await musdTester.allowance(alice, bob)).to.be.eq(to1e18(2))
    })

    it("decreaseAllowance(): fails trying to decrease more than previously allowed", async () => {
      await musdTester.approve(bob, to1e18(3))
      expect(await musdTester.allowance(alice, bob)).to.be.eq(to1e18(3))
      await expect(
        musdTester.decreaseAllowance(bob, to1e18(4), { from: alice }),
      ).to.be.reverted
      expect(await musdTester.allowance(alice, bob)).to.be.eq(to1e18(3))
    })
  })

  describe("Transferring MUSD", () => {
    it("transferFrom(): successfully transfers from an account which is it approved to transfer from", async () => {
      const allowanceA0 = await musdTester.allowance(bob, alice)
      expect(allowanceA0).to.be.eq(to1e18(0))

      await musdTester.connect(bob).approve(alice, to1e18(50))

      // Check A's allowance of Bob's funds has increased
      const allowanceA1 = await musdTester.allowance(bob, alice)
      expect(allowanceA1).to.be.eq(to1e18(50))

      expect(await musdTester.balanceOf(carol)).to.be.eq(to1e18(50))

      // Alice transfers from bob to Carol, using up her allowance
      await musdTester.connect(alice).transferFrom(bob, carol, to1e18(50))
      expect(await musdTester.balanceOf(carol)).to.be.eq(to1e18(100))

      // Check A's allowance of Bob's funds has decreased
      const allowanceA2 = await musdTester.allowance(bob, alice)
      expect(allowanceA2).to.be.eq(to1e18(0))

      // Check bob's balance has decreased
      expect(await musdTester.balanceOf(bob)).to.be.eq(to1e18(50))

      // Alice tries to transfer more tokens from bob's account to carol than she's allowed
      await expect(
        musdTester.connect(alice).transferFrom(bob, carol, to1e18(50)),
      ).to.be.reverted
    })

    it("transfer(): increases the recipient's balance by the correct amount", async () => {
      expect(await musdTester.balanceOf(alice)).to.be.eq(to1e18(150))

      await musdTester.connect(bob).transfer(alice, to1e18(37), { from: bob })

      expect(await musdTester.balanceOf(alice)).to.be.eq(to1e18(187))
    })

    it("transfer(): reverts if amount exceeds sender's balance", async () => {
      expect(await musdTester.balanceOf(bob)).to.be.eq(to1e18(100))
      await expect(musdTester.connect(bob).transfer(alice, to1e18(101))).to.be
        .reverted
    })

    it("transfer(): transferring to a blacklisted address reverts", async () => {
      await expect(
        musdTester
          .connect(alice)
          .transfer(await musdTester.getAddress(), to1e18(1)),
      ).to.be.reverted

      await expect(musdTester.connect(alice).transfer(ZERO_ADDRESS, to1e18(1)))
        .to.be.reverted
    })
  })

  describe("Minting and Burning MUSD", () => {
    it("mint(): issues correct amount of tokens to the given address", async () => {
      const aliceBalanceBefore = await musdTester.balanceOf(alice)
      expect(aliceBalanceBefore).to.be.eq(to1e18(150))

      await musdTester.unprotectedMint(alice, to1e18(100))

      const aliceBalanceAfter = await musdTester.balanceOf(alice)
      await expect(aliceBalanceAfter).to.be.eq(to1e18(250))
    })

    it("burn(): burns correct amount of tokens from the given address", async () => {
      const aliceBalanceBefore = await musdTester.balanceOf(alice)
      expect(aliceBalanceBefore).to.be.eq(to1e18(150))

      await musdTester.unprotectedBurn(alice, to1e18(70))

      const aliceBalanceAfter = await musdTester.balanceOf(alice)
      expect(aliceBalanceAfter).to.be.eq(to1e18(80))
    })
  })

  describe("Role based access", () => {
    context("Adding New Collateral", () => {
      it("startAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          musdTester
            .connect(alice)
            .startAddContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("startAddContracts(): reverts when provided addresses are not contracts", async () => {
        await expect(
          musdTester
            .connect(deployer)
            .startAddContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              alice.address,
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          musdTester
            .connect(deployer)
            .startAddContracts(
              await newTroveManager.getAddress(),
              alice.address,
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          musdTester
            .connect(deployer)
            .startAddContracts(
              alice,
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account code size cannot be zero")

        await expect(
          musdTester
            .connect(deployer)
            .startAddContracts(
              await newTroveManager.getAddress(),
              await newStabilityPool.getAddress(),
              ZERO_ADDRESS,
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          musdTester
            .connect(deployer)
            .startAddContracts(
              await newTroveManager.getAddress(),
              ZERO_ADDRESS,
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account cannot be zero address")

        await expect(
          musdTester
            .connect(deployer)
            .startAddContracts(
              ZERO_ADDRESS,
              await newStabilityPool.getAddress(),
              await newBorrowerOperations.getAddress(),
            ),
        ).to.be.revertedWith("Account cannot be zero address")
      })

      it("startAddContracts(): puts new set of contracts to pending list", async () => {
        await musdTester
          .connect(deployer)
          .startAddContracts(
            await newTroveManager.getAddress(),
            await newStabilityPool.getAddress(),
            await newBorrowerOperations.getAddress(),
          )
        const timeNow = await getLatestBlockTimestamp()
        expect(await musdTester.pendingTroveManager()).to.be.eq(
          await newTroveManager.getAddress(),
        )
        expect(await musdTester.pendingStabilityPool()).to.be.eq(
          await newStabilityPool.getAddress(),
        )
        expect(await musdTester.pendingBorrowerOperations()).to.be.eq(
          await newBorrowerOperations.getAddress(),
        )
        expect(await musdTester.addContractsInitiated()).to.be.eq(timeNow)

        expect(
          await musdTester.burnList(await newTroveManager.getAddress()),
        ).to.equal(false)
        expect(
          await musdTester.burnList(await newStabilityPool.getAddress()),
        ).to.equal(false)
        expect(
          await musdTester.burnList(await newBorrowerOperations.getAddress()),
        ).to.equal(false)
        expect(
          await musdTester.mintList(await newBorrowerOperations.getAddress()),
        ).to.equal(false)
      })

      it("cancelAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).cancelAddContracts(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("cancelAddContracts(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).cancelAddContracts(),
        ).to.be.revertedWith("Adding contracts is not started")
      })

      it("cancelAddContracts(): cancels adding system contracts", async () => {
        await musdTester
          .connect(deployer)
          .startAddContracts(
            await newTroveManager.getAddress(),
            await newStabilityPool.getAddress(),
            await newBorrowerOperations.getAddress(),
          )

        await musdTester.connect(deployer).cancelAddContracts()

        expect(await musdTester.pendingTroveManager()).to.be.eq(ZERO_ADDRESS)
        expect(await musdTester.pendingStabilityPool()).to.be.eq(ZERO_ADDRESS)
        expect(await musdTester.pendingBorrowerOperations()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await musdTester.addContractsInitiated()).to.be.eq(0)

        expect(
          await musdTester.burnList(await newTroveManager.getAddress()),
        ).to.equal(false)
        expect(
          await musdTester.burnList(await newStabilityPool.getAddress()),
        ).equal(false)
        expect(
          await musdTester.burnList(await newBorrowerOperations.getAddress()),
        ).to.equal(false)
        expect(
          await musdTester.mintList(await newBorrowerOperations.getAddress()),
        ).to.equal(false)
      })

      it("finalizeAddContracts(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).finalizeAddContracts(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("finalizeAddContracts(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).finalizeAddContracts(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeAddContracts(): reverts when not enough time has passed", async () => {
        await musdTester
          .connect(deployer)
          .startAddContracts(
            newTroveManager.getAddress(),
            newStabilityPool.getAddress(),
            newBorrowerOperations.getAddress(),
          )

        await expect(
          musdTester.connect(deployer).finalizeAddContracts(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeAddContracts(): enables new system contracts roles", async () => {
        await musdTester
          .connect(deployer)
          .startAddContracts(
            newTroveManager.getAddress(),
            newStabilityPool.getAddress(),
            newBorrowerOperations.getAddress(),
          )
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        const tx = await musdTester.connect(deployer).finalizeAddContracts()

        expect(await musdTester.pendingTroveManager()).to.be.eq(ZERO_ADDRESS)
        expect(await musdTester.pendingStabilityPool()).to.be.eq(ZERO_ADDRESS)
        expect(await musdTester.pendingBorrowerOperations()).to.be.eq(
          ZERO_ADDRESS,
        )
        expect(await musdTester.addContractsInitiated()).to.be.eq(0)

        expect(
          await musdTester.burnList(await troveManager.getAddress()),
        ).to.equal(true)
        expect(
          await musdTester.burnList(await newTroveManager.getAddress()),
        ).to.equal(true)
        expect(
          await musdTester.burnList(await stabilityPool.getAddress()),
        ).to.equal(true)
        expect(
          await musdTester.burnList(await newStabilityPool.getAddress()),
        ).to.equal(true)
        expect(
          await musdTester.burnList(await newBorrowerOperations.getAddress()),
        ).to.equal(true)
        expect(
          await musdTester.burnList(await borrowerOperations.getAddress()),
        ).to.equal(true)

        await expect(tx)
          .to.emit(musdTester, "TroveManagerAddressAdded")
          .withArgs(await newTroveManager.getAddress())
        await expect(tx)
          .to.emit(musdTester, "StabilityPoolAddressAdded")
          .withArgs(await newStabilityPool.getAddress())
        await expect(tx)
          .to.emit(musdTester, "BorrowerOperationsAddressAdded")
          .withArgs(await newBorrowerOperations.getAddress())
      })
    })

    context("Removing Mint Permissions", () => {
      it("startRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester
            .connect(alice)
            .startRevokeMintList(await borrowerOperations.getAddress()),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("startRevokeMintList(): reverts when account has no minting role", async () => {
        await expect(
          musdTester.connect(deployer).startRevokeMintList(alice),
        ).to.be.revertedWith("Incorrect address to revoke")
      })

      it("startRevokeMintList(): puts account to pending list", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeMintList(await borrowerOperations.getAddress())

        const timeNow = await getLatestBlockTimestamp()
        expect(await musdTester.pendingRevokedMintAddress()).to.be.equal(
          await borrowerOperations.getAddress(),
        )
        expect(await musdTester.revokeMintListInitiated()).to.be.equal(timeNow)
        expect(
          await musdTester.mintList(await borrowerOperations.getAddress()),
        ).to.equal(true)
      })

      it("cancelRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).cancelRevokeMintList(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("cancelRevokeMintList(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).cancelRevokeMintList(),
        ).to.be.revertedWith("Revoking from mint list is not started")
      })

      it("cancelRevokeMintList(): cancels revoking from mint list", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeMintList(await borrowerOperations.getAddress())
        await musdTester.connect(deployer).cancelRevokeMintList()

        expect(await musdTester.pendingRevokedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await musdTester.revokeMintListInitiated()).to.be.equal(0)
        expect(
          await musdTester.mintList(await borrowerOperations.getAddress()),
        ).to.equal(true)
      })

      it("finalizeRevokeMintList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).finalizeRevokeMintList(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("finalizeRevokeMintList(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).finalizeRevokeMintList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeRevokeMintList(): reverts when passed not enough time", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeMintList(await borrowerOperations.getAddress())
        await expect(
          musdTester.connect(deployer).finalizeRevokeMintList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeRevokeMintList(): removes account from minting list", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeMintList(await borrowerOperations.getAddress())
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await musdTester.connect(deployer).finalizeRevokeMintList()

        expect(await musdTester.pendingRevokedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await musdTester.revokeMintListInitiated()).to.be.equal(0)
        expect(
          await musdTester.mintList(borrowerOperations.getAddress()),
        ).to.equal(false)
      })
    })

    context("Mintlist Changes", () => {
      it("startAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).startAddMintList(alice),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("startAddMintList(): reverts when account already has minting role", async () => {
        await expect(
          musdTester
            .connect(deployer)
            .startAddMintList(await borrowerOperations.getAddress()),
        ).to.be.revertedWith("Incorrect address to add")
      })

      it("startAddMintList(): puts account to pending list", async () => {
        await musdTester.connect(deployer).startAddMintList(alice)

        const timeNow = await getLatestBlockTimestamp()
        expect(await musdTester.pendingAddedMintAddress()).to.be.equal(alice)
        expect(await musdTester.addMintListInitiated()).to.be.equal(timeNow)
        expect(await musdTester.mintList(alice)).to.equal(false)
      })

      it("cancelAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).cancelAddMintList(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("cancelAddMintList(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).cancelAddMintList(),
        ).to.be.revertedWith("Adding to mint list is not started")
      })

      it("cancelAddMintList(): cancels adding to mint list", async () => {
        await musdTester.connect(deployer).startAddMintList(alice)
        await musdTester.connect(deployer).cancelAddMintList()

        expect(await musdTester.pendingAddedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await musdTester.addMintListInitiated()).to.be.equal(0)
        expect(await musdTester.mintList(alice)).to.equal(false)
      })

      it("finalizeAddMintList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).finalizeAddMintList(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("finalizeAddMintList(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).finalizeAddMintList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeAddMintList(): reverts when passed not enough time", async () => {
        await musdTester.connect(deployer).startAddMintList(alice)
        await expect(
          musdTester.connect(deployer).finalizeAddMintList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeAddMintList(): adds account to minting list", async () => {
        await musdTester.connect(deployer).startAddMintList(alice)
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await musdTester.connect(deployer).finalizeAddMintList()

        expect(await musdTester.pendingAddedMintAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await musdTester.addMintListInitiated()).to.be.equal(0)
        expect(await musdTester.mintList(alice)).to.equal(true)
      })
    })

    context("Burnlist Changes", () => {
      it("startRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester
            .connect(alice)
            .startRevokeBurnList(await borrowerOperations.getAddress()),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("startRevokeBurnList(): reverts when account has no burning role", async () => {
        await expect(
          musdTester.connect(deployer).startRevokeBurnList(alice),
        ).to.be.revertedWith("Incorrect address to revoke")
      })

      it("startRevokeBurnList(): puts account to pending list", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeBurnList(await borrowerOperations.getAddress())

        const timeNow = await getLatestBlockTimestamp()
        expect(await musdTester.pendingRevokedBurnAddress()).to.be.equal(
          await borrowerOperations.getAddress(),
        )
        expect(await musdTester.revokeBurnListInitiated()).to.be.equal(timeNow)

        expect(
          await musdTester.burnList(await borrowerOperations.getAddress()),
        ).to.equal(true)
      })

      it("cancelRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).cancelRevokeBurnList(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("cancelRevokeBurnList(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).cancelRevokeBurnList(),
        ).to.be.revertedWith("Revoking from burn list is not started")
      })

      it("cancelRevokeBurnList(): cancels revoking from burn list", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeBurnList(await borrowerOperations.getAddress())
        await musdTester.connect(deployer).cancelRevokeBurnList()

        expect(await musdTester.pendingRevokedBurnAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await musdTester.revokeBurnListInitiated()).to.be.equal(0)

        expect(
          await musdTester.burnList(await borrowerOperations.getAddress()),
        ).to.equal(true)
      })

      it("finalizeRevokeBurnList(): reverts when caller is not owner", async () => {
        await expect(
          musdTester.connect(alice).finalizeRevokeBurnList(),
        ).to.be.revertedWith("Ownable: caller is not the owner")
      })

      it("finalizeRevokeBurnList(): reverts when change is not initiated", async () => {
        await expect(
          musdTester.connect(deployer).finalizeRevokeBurnList(),
        ).to.be.revertedWith("Change not initiated")
      })

      it("finalizeRevokeBurnList(): reverts when passed not enough time", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeBurnList(await borrowerOperations.getAddress())
        await expect(
          musdTester.connect(deployer).finalizeRevokeBurnList(),
        ).to.be.revertedWith("Governance delay has not elapsed")
      })

      it("finalizeRevokeBurnList(): removes account from minting list", async () => {
        await musdTester
          .connect(deployer)
          .startRevokeBurnList(await borrowerOperations.getAddress())
        await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)

        await musdTester.connect(deployer).finalizeRevokeBurnList()

        expect(await musdTester.pendingRevokedBurnAddress()).to.be.equal(
          ZERO_ADDRESS,
        )
        expect(await musdTester.revokeBurnListInitiated()).to.be.equal(0)

        expect(
          await musdTester.burnList(await borrowerOperations.getAddress()),
        ).to.equal(false)
      })
    })
  })
})
