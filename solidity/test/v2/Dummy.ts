import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { ethers } from "hardhat"
import { expect } from "chai"

describe("Dummy", () => {
  async function deployDummy() {
    const Dummy = await ethers.getContractFactory("Dummy")
    const dummy = await Dummy.deploy()
    return { dummy }
  }

  it("should return expected value", async () => {
    const { dummy } = await loadFixture(deployDummy)
    expect(await dummy.nope()).to.equal(0)
  })
})
