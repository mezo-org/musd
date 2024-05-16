import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { fixture, fastForwardTime } from "./helpers"
import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  GasPool,
  MUSD,
  MUSDTester,
  PCV,
  PriceFeedTestnet,
  SortedTroves,
  StabilityPool,
  TroveManager,
} from "../typechain"
import { to1e18 } from "./utils"

const GOVERNANCE_TIME_DELAY = 90 * 24 * 60 * 60 // 90 days in seconds
const ZERO_ADDRESS = `0x${"0".repeat(40)}`

describe("BorrowerOperations", () => {
  // contracts
  let activePool: ActivePool
  let borrowerOperations: BorrowerOperations
  let collSurplusPool: CollSurplusPool
  let defaultPool: DefaultPool
  let gasPool: GasPool
  let musd: MUSD
  let musdTester: MUSDTester
  let sortedTroves: SortedTroves
  let stabilityPool: StabilityPool
  let troveManager: TroveManager
  let pcv: PCV
  let priceFeedTestnet: PriceFeedTestnet

  // users
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let carol: HardhatEthersSigner
  let deployer: HardhatEthersSigner

  // Contract specific helper functions
  async function removeMintlist(owner: HardhatEthersSigner) {
    await musd
      .connect(owner)
      .startRevokeMintList(await borrowerOperations.getAddress())
    await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)
    await musd.connect(owner).finalizeRevokeMintList()
  }

  /*
   * given the requested MUSD amomunt in openTrove, returns the total debt
   * So, it adds the gas compensation and the borrowing fee
   */
  async function getOpenTroveTotalDebt(musdAmount: bigint) {
    const fee = await troveManager.getBorrowingFee(musdAmount)
    const compositeDebt = await borrowerOperations.getCompositeDebt(musdAmount)
    return compositeDebt + fee
  }

  interface OpenTroveParams {
    musdAmount: string | bigint
    ICR?: string
    lowerHint?: string
    maxFeePercentage?: string
    sender: HardhatEthersSigner
    upperHint?: string
  }

  async function openTrove(inputs: OpenTroveParams) {
    const params = inputs
    // fill in hints for searching trove list if not provided
    if (params.lowerHint === undefined) params.lowerHint = ZERO_ADDRESS
    if (params.upperHint === undefined) params.upperHint = ZERO_ADDRESS

    // open minimum debt amount unless extraMUSDAmount is specificed.
    // if (!params.musdAmount) params.musdAmount = (await borrowerOperations.MIN_NET_DEBT()) + 1n // add 1 to avoid rounding issues

    // max fee size cant exceed 100%
    if (params.maxFeePercentage === undefined) params.maxFeePercentage = "100"
    const maxFeePercentage = to1e18(params.maxFeePercentage) / 100n

    // ICR default of 150%
    if (params.ICR === undefined) params.ICR = "150"
    const ICR = to1e18(params.ICR) / 100n // 1e18 = 100%

    const musdAmount =
      typeof params.musdAmount === "bigint"
        ? params.musdAmount
        : to1e18(params.musdAmount)

    // amount of debt to take on
    const totalDebt = await getOpenTroveTotalDebt(musdAmount)

    // amount of assets required for the loan
    const price = await priceFeedTestnet.getPrice()
    const assetAmount = (ICR * totalDebt) / price

    // try {
    const tx = await borrowerOperations
      .connect(params.sender)
      .openTrove(
        maxFeePercentage,
        musdAmount,
        assetAmount,
        params.upperHint,
        params.lowerHint,
        {
          value: assetAmount, // Replace "1.0" with the amount of ETH to send
        },
      )
    // console.log(tx)
    // } catch (error) {
    //   // Log the revert reason
    //   console.log("Revert reason:", error.message);
    // }

    return {
      musdAmount,
      totalDebt,
      collateral: assetAmount,
      tx,
    }
  }

  beforeEach(async () => {
    ;({
      activePool,
      alice,
      bob,
      borrowerOperations,
      carol,
      collSurplusPool,
      defaultPool,
      deployer,
      gasPool,
      musd,
      musdTester,
      pcv,
      priceFeedTestnet,
      sortedTroves,
      stabilityPool,
      troveManager,
    } = await loadFixture(fixture))

    //  connect contracts
    await pcv
      .connect(deployer)
      .setAddresses(
        await musd.getAddress(),
        await borrowerOperations.getAddress(),
        ZERO_ADDRESS,
      )

    await activePool
      .connect(deployer)
      .setAddresses(
        await borrowerOperations.getAddress(),
        ZERO_ADDRESS,
        await collSurplusPool.getAddress(),
        await defaultPool.getAddress(),
        await troveManager.getAddress(),
        await stabilityPool.getAddress(),
      )

    await borrowerOperations
      .connect(deployer)
      .setAddresses(
        await activePool.getAddress(),
        ZERO_ADDRESS,
        await collSurplusPool.getAddress(),
        await defaultPool.getAddress(),
        await gasPool.getAddress(),
        await musd.getAddress(),
        await pcv.getAddress(),
        await priceFeedTestnet.getAddress(),
        await stabilityPool.getAddress(),
        await sortedTroves.getAddress(),
        await troveManager.getAddress(),
      )

    await troveManager
      .connect(deployer)
      .setAddresses(
        await activePool.getAddress(),
        await borrowerOperations.getAddress(),
        await collSurplusPool.getAddress(),
        await defaultPool.getAddress(),
        await gasPool.getAddress(),
        await musd.getAddress(),
        await pcv.getAddress(),
        await priceFeedTestnet.getAddress(),
        await sortedTroves.getAddress(),
        await stabilityPool.getAddress(),
      )

    await musdTester.unprotectedMint(alice, to1e18(150))
    await musdTester.unprotectedMint(bob, to1e18(100))
    await musdTester.unprotectedMint(carol, to1e18(50))
  })

  describe("Initial State", () => {
    it("name(): returns the contract's name", async () => {
      expect(await borrowerOperations.name()).to.equal("BorrowerOperations")
    })
  })

  describe("openTrove", () => {
    it("openTrove(): no mintlist, reverts", async () => {
      // remove mintlist
      await removeMintlist(deployer)
      await expect(
        openTrove({
          musdAmount: "100,000",
          ICR: "200",
          sender: deployer,
        }),
      ).to.be.revertedWith("MUSD: Caller not allowed to mint")
    })

    it("openTrove(): emits a TroveUpdated event with the correct collateral and debt", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): reverts if net debt < minimum net debt", async () => {
      await expect(
        openTrove({
          musdAmount: "0",
          ICR: "200",
          sender: alice,
        }),
      ).to.be.revertedWithPanic()

      await expect(
        openTrove({
          musdAmount: (await borrowerOperations.MIN_NET_DEBT()) - 1n,
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
        openTrove({
          musdAmount: "10,000",
          ICR: "200",
          sender: alice,
          maxFeePercentage: "101",
        }),
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
    })

    it("openTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
      await expect(
        openTrove({
          musdAmount: "10,000",
          ICR: "200",
          sender: alice,
          maxFeePercentage: "0",
        }),
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")

      await expect(
        openTrove({
          musdAmount: "10,000",
          ICR: "200",
          sender: bob,
          maxFeePercentage: "0.4999999999999999",
        }),
      ).to.be.revertedWith("Max fee percentage must be between 0.5% and 100%")
    })

    it("openTrove(): allows max fee < 0.5% in Recovery Mode", async () => {
      // TODO requires implementing functionality for troveManager.checkRecoveryMode
      // openTrove({
      //   musdAmount: "100,000",
      //   ICR: "200",
      //   sender: alice,
      // })
      // // collateral value drops from 200 to 10
      // let price = to1e18(10)
      // await priceFeedTestnet.connect(deployer).setPrice(price)
      // expect(await troveManager.checkRecoveryMode(price)).to.be.true
      // openTrove({
      //   musdAmount: "10,000",
      //   ICR: "200",
      //   sender: bob,
      //   maxFeePercentage: "0.4999999999999999"
      // })
      // const after = await musd.balanceOf(bob)
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
      // expect(await troveManager.baseRate()).to.be.equal(0);
      // const before = await musd.balanceOf(await pcv.getAddress())
      // expect(before).to.be.equal(0)
      // openTrove({
      //   musdAmount: "100,000",
      //   ICR: "200",
      //   sender: alice,
      // })
      // const after = await musd.balanceOf(await pcv.getAddress())
      // expect(after).to.be.equal(to1e18(500))
    })

    it("openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): reverts when system is in Recovery Mode and ICR < CCR", async () => {
      // TODO requires other contract functionality
    })

    it("openTrove(): reverts when trove ICR < MCR", async () => {
      openTrove({
        musdAmount: "100,000",
        ICR: "200",
        sender: alice,
      })

      expect(
        openTrove({
          musdAmount: "100,000",
          ICR: "109%",
          sender: alice,
        }),
      ).to.be.revertedWith("MUSD: Caller not allowed to mint")

      // collateral value drops from 200 to 10
      const price = to1e18(10)
      await priceFeedTestnet.connect(deployer).setPrice(price)

      // TODO requires other contract functionality for checkRecoveryMode to work
      // expect(await troveManager.checkRecoveryMode(price)).to.be.true
      //
      // expect(openTrove({
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
      // await openTrove({
      //   musdAmount: "10,000",
      //   ICR: "200",
      //   sender: alice,
      // })
      // const aliceDebt = await troveManager.getEntireDebtAndColl(alice.address)
      // console.log("alice", aliceDebt[0])
      // expect(aliceDebt[0]).to.equal(to1e18(10000))
      // const activePool_after = await activePool.getMUSDDebt()
      // expect(activePool_after).to.equal(aliceDebt)
    })

    it("openTrove(): increases user MUSD balance by correct amount", async () => {
      // opening balance
      const before = await musd.balanceOf(alice)
      expect(before).to.equal(0)

      await openTrove({
        musdAmount: "100,000",
        ICR: "200",
        sender: alice,
      })

      // check closing balance
      const after = await musd.balanceOf(alice)
      expect(after).to.equal(to1e18("100,000"))
    })
  })
})
