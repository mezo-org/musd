import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"

import {
  Contracts,
  TestSetup,
  TestingAddresses,
  connectContracts,
  fixtureBorrowerOperations,
  getAddresses,
  openTrove,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("BorrowerOperations in Recovery Mode", () => {
  let addresses: TestingAddresses
  // users
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let deployer: HardhatEthersSigner
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  beforeEach(async () => {
    // fixtureBorrowerOperations has a mock trove manager so we can change rates
    cachedTestSetup = await loadFixture(fixtureBorrowerOperations)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts

    await connectContracts(contracts, testSetup.users)
    // users
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    deployer = testSetup.users.deployer

    // readability helper
    addresses = await getAddresses(contracts, testSetup.users)
  })

  describe("openTrove", () => {
    it("openTrove(): Allows max fee < 0.5% in Recovery Mode", async () => {
      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "200",
        sender: alice,
      })
      // collateral value drops from 200 to 10
      const price = to1e18(10)
      await contracts.priceFeed.connect(deployer).setPrice(price)

      expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
        true,
      )
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "200",
        sender: bob,
        maxFeePercentage: "0.4999999999999999",
      })
      const after = await contracts.musd.balanceOf(bob)
      expect(after).to.equal(to1e18("10,000"))
    })

    it("openTrove(): Reverts when system is in Recovery Mode and ICR < CCR", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): Reverts when trove ICR < MCR", async () => {
      await openTrove(contracts, {
        musdAmount: "100,000,000",
        ICR: "200",
        sender: alice,
      })

      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "200",
        sender: bob,
      })

      await expect(
        openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "109",
          sender: carol,
        }),
      ).to.be.revertedWith(
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
      )

      // collateral value drops from 200 to 10
      const price = to1e18(10)
      await contracts.priceFeed.connect(deployer).setPrice(price)

      expect(await contracts.troveManager.checkRecoveryMode(price)).to.equal(
        true,
      )

      await expect(
        openTrove(contracts, {
          musdAmount: to1e18("10,000"),
          ICR: "109",
          sender: carol,
        }),
      ).to.be.revertedWith(
        "BorrowerOps: Operation must leave trove with ICR >= CCR",
      )
    })

    it("openTrove(): Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "150",
        sender: alice,
      })

      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "150",
        sender: bob,
      })

      // price drops to $100, reducing TCR below 150%
      await contracts.priceFeed.connect(deployer).setPrice(to1e18("100"))

      // Carol opens at 150% ICR in Recovery Mode
      await openTrove(contracts, {
        musdAmount: "10,000",
        ICR: "150",
        sender: carol,
      })

      expect(await contracts.sortedTroves.contains(addresses.carol)).is.equal(
        true,
      )

      const status = await contracts.troveManager.getTroveStatus(
        addresses.carol,
      )
      expect(status).is.equal(1)

      const price = await contracts.priceFeed.getPrice()
      const ICR = await contracts.troveManager.getCurrentICR(carol, price)
      expect(ICR).is.equal(to1e18(150) / 100n)
    })
  })
})
