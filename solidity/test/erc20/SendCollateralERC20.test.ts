import { expect } from "chai"
import { ethers } from "hardhat"
import { MockERC20, SendCollateralERC20Tester } from "../../typechain"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

describe("SendCollateralERC20", () => {
  let token: MockERC20
  let sender: SendCollateralERC20Tester
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner

  beforeEach(async () => {
    ;[deployer, alice, bob] = await ethers.getSigners()

    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()

    const SenderFactory = await ethers.getContractFactory("SendCollateralERC20Tester")
    sender = await SenderFactory.deploy(await token.getAddress())

    await token.mint(alice.address, ethers.parseEther("1000"))
  })

  describe("_sendCollateral", () => {
    it("should transfer tokens to recipient", async () => {
      await token.mint(await sender.getAddress(), ethers.parseEther("100"))
      await sender.sendCollateralPublic(bob.address, ethers.parseEther("50"))
      expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("50"))
    })

    it("should handle zero amount gracefully", async () => {
      await sender.sendCollateralPublic(bob.address, 0)
      expect(await token.balanceOf(bob.address)).to.equal(0)
    })
  })

  describe("_pullCollateral", () => {
    it("should pull tokens from sender", async () => {
      await token.connect(alice).approve(await sender.getAddress(), ethers.parseEther("100"))
      await sender.pullCollateralPublic(alice.address, ethers.parseEther("50"))
      expect(await token.balanceOf(await sender.getAddress())).to.equal(ethers.parseEther("50"))
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("950"))
    })

    it("should revert without approval", async () => {
      await expect(
        sender.pullCollateralPublic(alice.address, ethers.parseEther("50"))
      ).to.be.reverted
    })

    it("should handle zero amount gracefully", async () => {
      await sender.pullCollateralPublic(alice.address, 0)
    })
  })

  describe("collateralToken", () => {
    it("should return the collateral token address", async () => {
      expect(await sender.collateralToken()).to.equal(await token.getAddress())
    })
  })
})
