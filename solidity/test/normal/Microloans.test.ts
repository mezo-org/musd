import { helpers } from "hardhat"
import { expect } from "chai"

import { ContractTransactionResponse } from "ethers"
import {
  setupTests,
  User,
  Contracts,
  TroveStatus,
  TestingAddresses,
} from "../helpers"
import { ZERO_ADDRESS } from "../../helpers/constants"
import { Microloans, TroveManager } from "../../typechain"
import { to1e18 } from "../utils"

const { createSnapshot, restoreSnapshot } = helpers.snapshot

describe("Microloans in Normal Mode", () => {
  let alice: User
  let deployer: User

  let contracts: Contracts
  let microloans: Microloans
  let troveManager: TroveManager

  let addresses: TestingAddresses

  before(async () => {
    ;({ alice, deployer, contracts, addresses } = await setupTests())

    microloans = contracts.microloans
    troveManager = contracts.troveManager

    // BTC price at $100k to align with RFC-1: Microloans test vectors
    await contracts.mockAggregator
      .connect(deployer.wallet)
      .setPrice(to1e18(100_000))

    // Add MicroLoans to MUSD fee exempts
    const gov = contracts.governableVariables.connect(deployer.wallet)
    await gov.startChangingRoles(deployer.address, deployer.address)
    await gov.finalizeChangingRoles()
    await gov.addFeeExemptAccount(addresses.microloans)
  })

  const getMainTroveState = async () => {
    const price = await contracts.priceFeed.fetchPrice()
    return {
      collateral: await troveManager.getTroveColl(addresses.microloans),
      debt: await troveManager.getTroveDebt(addresses.microloans),
      cr: await troveManager.getCurrentICR(addresses.microloans, price),
      capacity: await troveManager.getTroveMaxBorrowingCapacity(
        addresses.microloans,
      ),
    }
  }

  describe("openTrove()", () => {
    context("when called by a third party", () => {
      it("reverts", async () => {
        await expect(
          microloans
            .connect(alice.wallet)
            .openMainTrove(1, ZERO_ADDRESS, ZERO_ADDRESS),
        ).to.be.revertedWithCustomError(
          microloans,
          "OwnableUnauthorizedAccount",
        )
      })
    })

    context("when called by the governance", () => {
      // [RFC-1] Test Vector 1: Initial State Setup
      //
      // Main Trove:
      //  - Collateral: 0.06 BTC ($6000)
      //  - Debt: 2000 MUSD
      //  - CR: 300%
      //  - Max borrowing capacity: ~5454.54 MUSD (at 110% CR)
      const musdMinDebt = to1e18("1800")
      const collateral = to1e18("0.06")
      const debt = to1e18("2000")
      const CR = 300
      const maxBorrowingCapacity = to1e18("5454.54")

      let tx: ContractTransactionResponse

      before(async () => {
        await createSnapshot()

        tx = await microloans
          .connect(deployer.wallet)
          .openMainTrove(musdMinDebt, ZERO_ADDRESS, ZERO_ADDRESS, {
            value: collateral,
          })
      })

      after(async () => {
        await restoreSnapshot()
      })

      it("should open the main trove", async () => {
        expect(
          await troveManager.getTroveStatus(addresses.microloans),
        ).to.equal(TroveStatus.Active)
      })

      it("should emit MainTroveOpened event", async () => {
        await expect(tx)
          .to.emit(microloans, "MainTroveOpened")
          .withArgs(musdMinDebt, collateral)
      })

      it("should have expected main trove state", async () => {
        const t = await getMainTroveState()

        expect(t.collateral).to.equal(collateral)
        expect(t.debt).to.equal(debt)
        expect(t.cr).to.equal(to1e18(CR) / 100n)
        expect(t.capacity).to.be.closeTo(maxBorrowingCapacity, to1e18("0.01"))
      })
    })
  })
})
