import { helpers } from "hardhat"
import { expect } from "chai"

import { ContractTransactionResponse } from "ethers"
import { setupTests, User, Contracts, TroveStatus } from "../helpers"
import { ZERO_ADDRESS } from "../../helpers/constants"
import { Microloans, TroveManager } from "../../typechain"
import { to1e18 } from "../utils"

const { createSnapshot, restoreSnapshot } = helpers.snapshot

describe.only("Microloans in Normal Mode", () => {
  let alice: User
  let deployer: User

  let contracts: Contracts
  let microloans: Microloans
  let troveManager: TroveManager

  let microloansAddress: string

  before(async () => {
    ;({ alice, deployer, contracts } = await setupTests())

    microloans = contracts.microloans
    microloansAddress = await microloans.getAddress()

    troveManager = contracts.troveManager

    // BTC price at $100k to align with RFC-1: Microloans test vectors
    await contracts.mockAggregator
      .connect(deployer.wallet)
      .setPrice(to1e18(100_000))

    // Add MicroLoans to MUSD fee exempts
    const gov = contracts.governableVariables.connect(deployer.wallet)
    await gov.startChangingRoles(deployer.address, deployer.address)
    await gov.finalizeChangingRoles()
    await gov.addFeeExemptAccount(microloansAddress)
  })

  const computeCollateralAmount = async (
    musdAmount: bigint,
    collateralizationRatio: number,
  ) => {
    const ICR = to1e18(collateralizationRatio) / 100n // 1e18 = 100%

    const price = await contracts.priceFeed.fetchPrice()
    const totalDebt = await contracts.troveManager.getCompositeDebt(musdAmount)

    return (ICR * totalDebt) / price
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
      const musdAmount = to1e18("1800")
      const collateralizationRatio = 300

      let collateralAmount: bigint
      let tx: ContractTransactionResponse

      before(async () => {
        await createSnapshot()

        collateralAmount = await computeCollateralAmount(
          musdAmount,
          collateralizationRatio,
        )

        tx = await microloans
          .connect(deployer.wallet)
          .openMainTrove(musdAmount, ZERO_ADDRESS, ZERO_ADDRESS, {
            value: collateralAmount,
          })
      })

      after(async () => {
        await restoreSnapshot()
      })

      it("should open the main trove", async () => {
        expect(await troveManager.getTroveStatus(microloansAddress)).to.equal(
          TroveStatus.Active,
        )
      })

      it("should emit MainTroveOpened event", async () => {
        await expect(tx)
          .to.emit(microloans, "MainTroveOpened")
          .withArgs(musdAmount, collateralAmount)
      })

      it("should have expected main trove parameters", async () => {
        // Per RFC-1: Microloans test vectors
        //
        // Main Trove:
        //  - Collateral: 0.06 BTC ($6000)
        //  - Debt: 2000 MUSD
        //  - CR: 300%
        //  - Max borrowing capacity: ~5454.54 MUSD (at 110% CR)
        const collateral = await troveManager.getTroveColl(microloansAddress)
        const debt = await troveManager.getTroveDebt(microloansAddress)
        const cr = await troveManager.getCurrentICR(
          microloansAddress,
          await contracts.priceFeed.fetchPrice(),
        )
        const capacity =
          await troveManager.getTroveMaxBorrowingCapacity(microloansAddress)

        expect(collateral).to.equal("60000000000000000") // 0.06 BTC
        expect(debt).to.equal(to1e18("2000"))
        expect(cr).to.equal(to1e18("3"))
        expect(capacity).to.be.closeTo(to1e18("5454"), to1e18("1"))
      })
    })
  })
})
