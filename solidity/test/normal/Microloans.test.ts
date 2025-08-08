import { helpers } from "hardhat"
import { expect } from "chai"

import { ContractTransactionResponse } from "ethers"
import { setupTests, User, Contracts, TroveStatus } from "../helpers"
import { ZERO_ADDRESS } from "../../helpers/constants"
import { Microloans, MUSD, TroveManager } from "../../typechain"
import { to1e18 } from "../utils"

const { createSnapshot, restoreSnapshot } = helpers.snapshot

describe("Microloans in Normal Mode", () => {
  let alice: User
  let deployer: User

  let contracts: Contracts
  let microloans: Microloans
  let troveManager: TroveManager
  let musd: MUSD

  let microloansAddress: string

  before(async () => {
    ;({ alice, deployer, contracts } = await setupTests())

    microloans = contracts.microloans
    microloansAddress = await microloans.getAddress()
    troveManager = contracts.troveManager
    musd = contracts.musd

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

  const getMainTroveState = async () => {
    const price = await contracts.priceFeed.fetchPrice()
    return {
      collateral: await troveManager.getTroveColl(microloansAddress),
      debt: await troveManager.getTroveDebt(microloansAddress),
      cr: await troveManager.getCurrentICR(microloansAddress, price),
      capacity:
        await troveManager.getTroveMaxBorrowingCapacity(microloansAddress),
    }
  }

  describe("openMainTrove()", () => {
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
      // Main trove:
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
        expect(await troveManager.getTroveStatus(microloansAddress)).to.equal(
          TroveStatus.Active,
        )
      })

      it("should emit MainTroveOpened event", async () => {
        await expect(tx)
          .to.emit(microloans, "MainTroveOpened")
          .withArgs(musdMinDebt, collateral)
      })

      it("should put main trove into expected state", async () => {
        const t = await getMainTroveState()

        expect(t.collateral).to.equal(collateral)
        expect(t.debt).to.equal(debt)
        expect(t.cr).to.equal(to1e18(CR) / 100n)
        expect(t.capacity).to.be.closeTo(maxBorrowingCapacity, to1e18("0.01"))
      })
    })
  })

  describe("openMicroTrove()", () => {
    context("when there is no main trove", () => {
      it("should revert", async () => {
        await expect(
          microloans
            .connect(alice.wallet)
            .openMicroTrove(to1e18(1), ZERO_ADDRESS, ZERO_ADDRESS, {
              value: to1e18(2),
            }),
        ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
      })

      context("when there is a main trove", () => {
        // [RFC-1] Test Vector 2: Opening a Microloan
        //
        // Expected state (initial, from Test Vector 1):
        //  - Collateral: 0.06 BTC
        //  - Borrowed: 1800 MUSD
        //  - Debt: 2000 MUSD
        const initialCollateral = to1e18("0.06")
        const initialMusdBorrowed = to1e18("1800")

        before(async () => {
          await createSnapshot()

          await microloans
            .connect(deployer.wallet)
            .openMainTrove(initialMusdBorrowed, ZERO_ADDRESS, ZERO_ADDRESS, {
              value: initialCollateral,
            })
        })

        after(async () => {
          await restoreSnapshot()
        })

        context("when enough collateral is provided", () => {
          // [RFC-1] Test Vector 2: Opening a Microloan
          //
          // Inputs:
          //  - User wants to borrow 25 MUSD
          //  - Required BTC collateral 0.0002889375 BTC
          const borrowed = to1e18("25")
          const collateral = to1e18("0.0002889375")
          // Expected state after opening the micro trove
          const mainTroveCollateral = to1e18("0.0602889375")
          const mainTroveDebt = to1e18("2025")
          const mainTroveCR = to1e18("297.7")

          // TODO: calculate issuance fee and add proper assertions

          let tx: ContractTransactionResponse

          before(async () => {
            await createSnapshot()

            tx = await microloans
              .connect(alice.wallet)
              .openMicroTrove(borrowed, ZERO_ADDRESS, ZERO_ADDRESS, {
                value: collateral,
              })
          })

          after(async () => {
            await restoreSnapshot()
          })

          it("should mint MUSD to the borrower", async () => {
            await expect(tx).to.changeTokenBalance(
              musd,
              alice.address,
              borrowed,
            )
          })

          it("should put main trove into expected state", async () => {
            const t = await getMainTroveState()

            expect(t.collateral).to.equal(mainTroveCollateral)
            expect(t.debt).to.equal(mainTroveDebt)
            expect(t.cr).to.equal(mainTroveCR / 100n)
          })
        })

        context("when not enough collateral is provided", () => {
          // [RFC-1] Test Vector 2: Opening a Microloan
          //
          // Inputs:
          //  - User wants to borrow 25 MUSD
          //  - Required BTC collateral 0.0002889375 BTC
          //
          // From the happy path test vector inputs, we deduct some collateral
          // to make it below the required minimum.
          const borrowed = to1e18("25")
          const collateral = to1e18("0.0002889375") - to1e18("0.00001")

          it("should revert", async () => {
            await expect(
              microloans
                .connect(alice.wallet)
                .openMicroTrove(borrowed, ZERO_ADDRESS, ZERO_ADDRESS, {
                  value: collateral,
                }),
            ).to.revertedWithCustomError(
              microloans,
              "CollateralizationBelowMinimum",
            )
          })
        })

        context("when micro trove already exists for the address", () => {
          // [RFC-1] Test Vector 2: Opening a Microloan
          //
          // Inputs:
          //  - User wants to borrow 25 MUSD
          //  - Required BTC collateral 0.0002889375 BTC
          //
          // With the same happy path test vector inputs, we try to open
          // a micro trove for the same user twice.
          const borrowed = to1e18("25")
          const collateral = to1e18("0.0002889375")

          before(async () => {
            await createSnapshot()

            await microloans
              .connect(alice.wallet)
              .openMicroTrove(borrowed, ZERO_ADDRESS, ZERO_ADDRESS, {
                value: collateral,
              })
          })

          after(async () => {
            await restoreSnapshot()
          })

          it("should revert", async () => {
            await expect(
              microloans
                .connect(alice.wallet)
                .openMicroTrove(borrowed, ZERO_ADDRESS, ZERO_ADDRESS, {
                  value: collateral,
                }),
            ).to.be.revertedWithCustomError(
              microloans,
              "MicroTroveAlreadyExists",
            )
          })
        })
      })
    })
  })
})
