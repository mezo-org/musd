import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect, assert } from "chai"
import {
  Contracts,
  TestSetup,
  fixtureBorrowerOperations,
  connectContracts,
  removeMintlist,
  openTrove,
  getTroveEntireColl,
  getTroveEntireDebt,
  getEventArgByName,
} from "./helpers"
import { to1e18 } from "./utils"

describe("BorrowerOperations", () => {
  // users
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let dennis: HardhatEthersSigner
  let eric: HardhatEthersSigner
  let deployer: HardhatEthersSigner
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup
  let MIN_NET_DEBT: bigint

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
    dennis = testSetup.users.dennis
    eric = testSetup.users.eric
    deployer = testSetup.users.deployer

    MIN_NET_DEBT = await contracts.borrowerOperations.MIN_NET_DEBT()
  })

  describe("Initial State", () => {
    it("name(): returns the contract's name", async () => {
      expect(await contracts.borrowerOperations.name()).to.equal(
        "BorrowerOperations",
      )
    })
  })

  describe("openTrove", () => {
    it("openTrove(): no mintlist, reverts", async () => {
      // remove mintlist
      await removeMintlist(contracts, deployer)
      await expect(
        openTrove(contracts, {
          musdAmount: "100,000",
          ICR: "200",
          sender: deployer,
        }),
      ).to.be.revertedWith("MUSD: Caller not allowed to mint")
    })

    it("openTrove(): emits a TroveUpdated event with the correct collateral and debt", async () => {
      const abi = [
        // Add your contract ABI here
        "event TroveUpdated(address indexed borrower, uint256 debt, uint256 coll, uint256 stake, uint8 operation)",
      ]

      // data setup
      let transactions = [
        {
          musdAmount: "15,000",
          ICR: "200",
          sender: alice,
        },
        {
          musdAmount: "5,000",
          ICR: "200",
          sender: bob,
        },
        {
          musdAmount: "3,000",
          ICR: "200",
          sender: carol,
        },
      ]

      let tx
      let coll
      let emittedColl
      let debt
      let emittedDebt

      // validation
      for (let i = 0; i < transactions.length; i++) {
        tx = (await openTrove(contracts, transactions[i])).tx

        coll = await getTroveEntireColl(contracts, transactions[i].sender)
        emittedColl = await getEventArgByName(tx, abi, "TroveUpdated", 2)
        expect(coll).to.equal(emittedColl)

        debt = await getTroveEntireDebt(contracts, transactions[i].sender)
        emittedDebt = await getEventArgByName(tx, abi, "TroveUpdated", 1)
        expect(debt).to.equal(emittedDebt)
      }

      // system state change via Tester functionality
      const baseRateBefore = await contracts.troveManager.baseRate()

      if ("setBaseRate" in contracts.troveManager) {
        // Artificially make baseRate 5%
        const newRate = to1e18(5) / 100n
        await contracts.troveManager.setBaseRate(newRate)
        await contracts.troveManager.setLastFeeOpTimeToNow()
      } else {
        assert.fail("TroveManagerTester not loaded")
      }

      expect(await contracts.troveManager.baseRate()).to.be.greaterThan(
        baseRateBefore,
      )

      // data setup
      transactions = [
        {
          musdAmount: "5,000",
          ICR: "200",
          sender: dennis,
        },
        {
          musdAmount: "3,000",
          ICR: "200",
          sender: eric,
        },
      ]

      // validation
      for (let i = 0; i < transactions.length; i++) {
        tx = (await openTrove(contracts, transactions[i])).tx

        coll = await getTroveEntireColl(contracts, transactions[i].sender)
        emittedColl = await getEventArgByName(tx, abi, "TroveUpdated", 2)
        expect(coll).to.equal(emittedColl)

        debt = await getTroveEntireDebt(contracts, transactions[i].sender)
        emittedDebt = await getEventArgByName(tx, abi, "TroveUpdated", 1)
        expect(debt).to.equal(emittedDebt)
      }
    })

    it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
      // TODO requires other contract functionality

      await openTrove(contracts, {
        musdAmount: MIN_NET_DEBT,
        ICR: "200",
        sender: alice,
      })
      expect(await contracts.sortedTroves.contains(alice.address)).to.equal(
        true,
      )

      await openTrove(contracts, {
        musdAmount: "477,898,980,000",
        ICR: "200",
        sender: eric,
      })
      expect(await contracts.sortedTroves.contains(eric.address)).to.equal(true)
    })

    it("openTrove(): reverts if net debt < minimum net debt", async () => {
      await expect(
        openTrove(contracts, {
          musdAmount: "0",
          ICR: "200",
          sender: alice,
        }),
      ).to.be.revertedWithPanic()

      await expect(
        openTrove(contracts, {
          musdAmount: (await contracts.borrowerOperations.MIN_NET_DEBT()) - 1n,
          ICR: "200",
          sender: bob,
        }),
      ).to.be.revertedWith(
        "BorrowerOps: Trove's net debt must be greater than minimum",
      )
    })

    it("openTrove(): decays a non-zero base rate", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): doesn't change base rate if it is already zero", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): reverts if max fee > 100%", async () => {
      await expect(
        openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: alice,
          maxFeePercentage: "101",
        }),
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
    })

    it("openTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
      await expect(
        openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: alice,
          maxFeePercentage: "0",
        }),
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")

      await expect(
        openTrove(contracts, {
          musdAmount: "10,000",
          ICR: "200",
          sender: bob,
          maxFeePercentage: "0.4999999999999999",
        }),
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
    })

    it("openTrove(): allows max fee < 0.5% in Recovery Mode", async () => {
      // TODO requires implementing functionality for troveManager.checkRecoveryMode
      // openTrove(contracts, {
      //   musdAmount: "100,000",
      //   ICR: "200",
      //   sender: alice,
      // })
      // // collateral value drops from 200 to 10
      // let price = to1e18(10)
      // await contracts.priceFeedTestnet.connect(deployer).setPrice(price)
      // expect(await contracts.troveManager.checkRecoveryMode(price)).to.be.true
      // openTrove(contracts, {
      //   musdAmount: "10,000",
      //   ICR: "200",
      //   sender: bob,
      //   maxFeePercentage: "0.4999999999999999"
      // })
      // const after = await contracts.musd.balanceOf(bob)
      // expect(after).to.equal(to1e18("10,000"))
    })

    it("openTrove(): reverts if fee exceeds max fee percentage", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): succeeds when fee is less than max fee percentage", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): borrowing at non-zero base rate sends MUSD fee to PCV contract", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): Borrowing at non-zero base rate increases the PCV contract MUSD fees", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): Borrowing at zero base rate changes the PCV contract MUSD fees collected", async () => {
      // TODO requires other contract functionality
      // expect(await contracts.troveManager.baseRate()).to.be.equal(0);
      // const before = await contracts.musd.balanceOf(await pcv.getAddress())
      // expect(before).to.be.equal(0)
      // openTrove(contracts, {
      //   musdAmount: "100,000",
      //   ICR: "200",
      //   sender: alice,
      // })
      // const after = await contracts.musd.balanceOf(await pcv.getAddress())
      // expect(after).to.be.equal(to1e18(500))
    })

    it("openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): reverts when system is in Recovery Mode and ICR < CCR", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): reverts when trove ICR < MCR", async () => {
      openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "200",
        sender: alice,
      })

      expect(
        openTrove(contracts, {
          musdAmount: "100,000",
          ICR: "109%",
          sender: alice,
        }),
      ).to.be.revertedWith("MUSD: Caller not allowed to mint")

      // collateral value drops from 200 to 10
      const price = to1e18(10)
      await contracts.priceFeed.connect(deployer).setPrice(price)

      // TODO requires other contract functionality for checkRecoveryMode to work
      // expect(await contracts.troveManager.checkRecoveryMode(price)).to.be.true
      //
      // expect(openTrove(contracts, {
      //   musdAmount: to1e18("100,000"),
      //   ICR: "109",
      //   sender: alice,
      // })).to.be.revertedWith("MUSD: Caller not allowed to mint")
    })

    it("openTrove(): reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {})

    it("openTrove(): reverts if trove is already active", async () => {})

    it("openTrove(): Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): Reverts opening a trove with min debt when system is in Recovery Mode", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): creates a new Trove and assigns the correct collateral and debt amount", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): adds Trove owner to TroveOwners array", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): creates a stake and adds it to total stakes", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): inserts Trove to Sorted Troves list", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): Increases the activePool collateral and raw collateral balance by correct amount", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): records up-to-date initial snapshots of L_Collateral and L_MUSDDebt", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): allows a user to open a Trove, then close it, then re-open it", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): increases the Trove's MUSD debt by the correct amount", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): increases MUSD debt in ActivePool by the debt of the trove", async () => {
      // TODO requires other contract functionality
      // const activePool_before = await activePool.getMUSDDebt()
      // expect(activePool_before).to.equal(0)
      // await openTrove(contracts, {
      //   musdAmount: "10,000",
      //   ICR: "200",
      //   sender: alice,
      // })
      // const aliceDebt = await contracts.troveManager.getEntireDebtAndColl(alice.address)
      // console.log("alice", aliceDebt[0])
      // expect(aliceDebt[0]).to.equal(to1e18(10000))
      // const activePool_after = await activePool.getMUSDDebt()
      // expect(activePool_after).to.equal(aliceDebt)
    })

    it("openTrove(): increases user MUSD balance by correct amount", async () => {
      // opening balance
      const before = await contracts.musd.balanceOf(alice)
      expect(before).to.equal(0)

      await openTrove(contracts, {
        musdAmount: "100,000",
        ICR: "200",
        sender: alice,
      })

      // check closing balance
      const after = await contracts.musd.balanceOf(alice)
      expect(after).to.equal(to1e18("100,000"))
    })
  })
})
