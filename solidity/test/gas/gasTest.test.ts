import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { expect } from "chai"
import { helpers } from "hardhat"
import {
  Contracts,
  fastForwardTime,
  openTrove,
  performRedemption,
  setInterestRate,
  setupTests,
  updateTroveSnapshot,
  User,
} from "../helpers"
import { to1e18 } from "../utils"

describe("Gas cost tests", () => {
  let alice: User
  let bob: User
  let council: User
  let deployer: User
  let treasury: User
  let contracts: Contracts
  let accounts: HardhatEthersSigner[]

  beforeEach(async () => {
    ;({ alice, bob, deployer, council, treasury, contracts } =
      await setupTests())

    accounts = await helpers.signers.getUnnamedSigners()

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()
  })

  describe("redeemCollateral()", () => {
    it("many troves, many interest rates", async () => {
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "400",
        sender: alice.wallet,
      })
      await openTrove(contracts, {
        musdAmount: "5000",
        ICR: "1000",
        sender: bob.wallet,
      })

      await updateTroveSnapshot(contracts, alice, "before")

      // Open a trove for each account with a different interest rate
      await Promise.all(
        accounts.slice(5).map(async (account, i) => {
          // skip the first 5 accounts so we don't use named signers
          await setInterestRate(contracts, council, i)
          await openTrove(contracts, {
            musdAmount: "5000",
            ICR: "400",
            sender: account,
          })
        }),
      )

      // fast-forward time 5 years
      await fastForwardTime(60 * 24 * 24 * 365 * 5)

      // redeemCollateral on Alice's trove (note she is no longer the lowest ICR due to interest)
      const tx = await performRedemption(contracts, bob, alice, to1e18("100"))
      const receipt = await tx.wait()

      await updateTroveSnapshot(contracts, alice, "after")

      const MAX_GAS_COST = 2000000
      expect(receipt?.gasUsed).to.be.lessThan(MAX_GAS_COST)
    })
  })
})
