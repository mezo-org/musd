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
      // set to true to test without interest to compare performance with out of order troves
      const testWithoutInterest = false
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
        // skip the first 5 accounts so we don't use named signers
        accounts.slice(5).map(async (account, i) => {
          // set interest rate to 0 if we are testing without interest to keep everything the same
          await setInterestRate(contracts, council, testWithoutInterest ? 0 : i)
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

      /*
       * In testing, gas usage came out to the same for both cases:
       * with 0% interest (so troves stay in order) Gas used:  410526n
       * with varying interest rates (so troves become out of order) Gas used:  410526n
       * MAX_GAS_COST is set to roughly double this amount, but this is an arbitrary limit and can be adjusted
       */
      const MAX_GAS_COST = 850000
      expect(receipt?.gasUsed).to.be.lessThan(MAX_GAS_COST)
    })
  })
})
