import { expect } from "chai"
import { ethers } from "hardhat"
import { MockERC20 } from "../../typechain"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

describe("MockERC20", () => {
  let token: MockERC20
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner

  beforeEach(async () => {
    ;[deployer, alice] = await ethers.getSigners()
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()
  })

  describe("mint", () => {
    it("should mint tokens to specified address", async () => {
      const amount = ethers.parseEther("1000")
      await token.mint(alice.address, amount)
      expect(await token.balanceOf(alice.address)).to.equal(amount)
    })

    it("should update total supply", async () => {
      const amount = ethers.parseEther("1000")
      await token.mint(alice.address, amount)
      expect(await token.totalSupply()).to.equal(amount)
    })
  })

  describe("metadata", () => {
    it("should have correct name", async () => {
      expect(await token.name()).to.equal("Mock Collateral")
    })

    it("should have correct symbol", async () => {
      expect(await token.symbol()).to.equal("MCOLL")
    })

    it("should have 18 decimals", async () => {
      expect(await token.decimals()).to.equal(18)
    })
  })
})
