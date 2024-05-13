import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { helpers } from "hardhat"
import { expect } from "chai"
import { deployment } from "./helpers"
import { BorrowerOperations, MUSDTester } from "../typechain"
import { to1e18 } from "./utils"

async function fixture() {
  const { musdTester, borrowerOperations } = await deployment()
  const [alice, bob, carol] = await helpers.signers.getUnnamedSigners()

  return {
    alice,
    bob,
    carol,
    musdTester,
    borrowerOperations,
  }
}

describe("BorrowerOperations", () => {
  // contracts
  let musdTester: MUSDTester
  let borrowerOperations: BorrowerOperations

  // users
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner

  beforeEach(async () => {
    ;({ alice, bob, carol, musdTester, borrowerOperations } =
      await loadFixture(fixture))

    await musdTester.unprotectedMint(alice, to1e18(150))
    await musdTester.unprotectedMint(bob, to1e18(100))
    await musdTester.unprotectedMint(carol, to1e18(50))
  })

  describe("Initial State", () => {
    it("name(): returns the contract's name", async () => {
      expect(await borrowerOperations.name()).to.equal("BorrowerOperations")
    })
  })
})
