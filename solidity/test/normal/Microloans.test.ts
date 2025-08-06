import { helpers } from "hardhat"
import { expect } from "chai"

import { ContractTransactionResponse } from "ethers"
import { setupTests, getOpenTroveTotalDebt, User, Contracts } from "../helpers"
import { ZERO_ADDRESS } from "../../helpers/constants"
import { Microloans } from "../../typechain"
import { to1e18 } from "../utils"

const { createSnapshot, restoreSnapshot } = helpers.snapshot

describe("Microloans in Normal Mode", () => {
  let alice: User
  let deployer: User

  let contracts: Contracts

  let microloans: Microloans
  let microloansAddress: string

  before(async () => {
    ;({ alice, deployer, contracts } = await setupTests())
    microloans = contracts.microloans
    microloansAddress = await microloans.getAddress()
  })

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
      let collateralAmount: bigint
      let tx: ContractTransactionResponse

      before(async () => {
        await createSnapshot()

        const lowerHint = ZERO_ADDRESS
        const upperHint = ZERO_ADDRESS

        const ICR = to1e18("200") / 100n // 1e18 = 100%

        const price = await contracts.priceFeed.fetchPrice()
        const totalDebt = await getOpenTroveTotalDebt(contracts, musdAmount)
        collateralAmount = (ICR * totalDebt) / price

        tx = await microloans
          .connect(deployer.wallet)
          .openMainTrove(musdAmount, lowerHint, upperHint, {
            value: collateralAmount,
          })
      })

      after(async () => {
        await restoreSnapshot()
      })

      it("should open the main trove", async () => {
        // TODO: Define TS constants for trove status
        expect(
          await contracts.troveManager.getTroveStatus(microloansAddress),
        ).to.equal(1)
      })

      it("should emit MainTroveOpened event", async () => {
        await expect(tx)
          .to.emit(microloans, "MainTroveOpened")
          .withArgs(musdAmount, collateralAmount)
      })
    })
  })
})
