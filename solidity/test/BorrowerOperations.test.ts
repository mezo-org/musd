import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { fixture, fastForwardTime } from "./helpers"
import {
  ActivePool,
  BorrowerOperations,
  CollSurplusPool,
  DefaultPool,
  Dummy,
  MUSD,
  MUSDTester,
  PCV,
  PriceFeedTestnet,
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
  let dummy: Dummy
  let musd: MUSD
  let musdTester: MUSDTester
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
   * given the requested THUSD amomunt in openTrove, returns the total debt
   * So, it adds the gas compensation and the borrowing fee
   */
  async function getOpenTroveTotalDebt(musdAmount: bigint) {
    const fee = await troveManager.getBorrowingFee(musdAmount)
    const compositeDebt = await borrowerOperations.getCompositeDebt(musdAmount)
    return compositeDebt + fee
  }

  interface OpenTroveParams {
    extraMUSDAmount?: bigint
    ICR?: bigint
    lowerHint?: string
    maxFeePercentage?: bigint
    sender: HardhatEthersSigner
    upperHint?: string
  }

  async function openTrove(inputs: OpenTroveParams) {
    const params = inputs
    // fill in hints for searching trove list if not provided
    if (!params.lowerHint) params.lowerHint = ZERO_ADDRESS
    if (!params.upperHint) params.upperHint = ZERO_ADDRESS

    // open minimum debt amount unless extraMUSDAmount is specificed.
    if (!params.extraMUSDAmount) params.extraMUSDAmount = to1e18(0)

    // max fee size cant exceed 100%
    if (!params.maxFeePercentage) params.maxFeePercentage = to1e18(1)

    // ICR default of 150%
    if (!params.ICR) params.ICR = to1e18(1.5)

    // amount of debt to take on
    const musdAmount =
      (await borrowerOperations.MIN_NET_DEBT()) + 1n + params.extraMUSDAmount // add 1 to avoid rounding issues
    const totalDebt = await getOpenTroveTotalDebt(musdAmount)

    // amount of assets required for the loan
    const price = await priceFeedTestnet.getPrice()
    const assetAmount = (params.ICR * totalDebt) / price
    // try {
    const tx = await borrowerOperations
      .connect(params.sender)
      .openTrove(
        params.maxFeePercentage,
        musdAmount,
        assetAmount,
        params.upperHint,
        params.lowerHint,
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
      dummy,
      musd,
      musdTester,
      pcv,
      priceFeedTestnet,
      stabilityPool,
      troveManager,
    } = await loadFixture(fixture))

    //  connect contracts
    await borrowerOperations
      .connect(deployer)
      .setAddresses(
        await troveManager.getAddress(),
        await activePool.getAddress(),
        await defaultPool.getAddress(),
        await stabilityPool.getAddress(),
        await dummy.getAddress(),
        await collSurplusPool.getAddress(),
        await priceFeedTestnet.getAddress(),
        await dummy.getAddress(),
        await musd.getAddress(),
        await pcv.getAddress(),
        await dummy.getAddress(),
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
    it("no mintlist, reverts", async () => {
      // remove mintlist
      await removeMintlist(deployer)
      await expect(
        openTrove({
          extraMUSDAmount: to1e18(100000),
          ICR: to1e18(2),
          sender: deployer,
        }),
      ).to.be.revertedWith("MUSD: Caller not allowed to mint")
    })
  })
})
