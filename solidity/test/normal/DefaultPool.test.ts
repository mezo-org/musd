import { expect } from "chai"
import { ethers, network } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  NO_GAS,
  Contracts,
  ContractsState,
  TestingAddresses,
  setupTests,
  updateContractsSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"

describe("DefaultPool", () => {
  let addresses: TestingAddresses
  let contracts: Contracts
  let state: ContractsState

  let troveManagerSigner: HardhatEthersSigner

  beforeEach(async () => {
    ;({ state, contracts, addresses } = await setupTests())

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.troveManager],
    })

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.activePool],
    })

    troveManagerSigner = await ethers.getSigner(addresses.troveManager)
  })

  describe("sendCollateralToActivePool()", () => {
    context("Expected Reverts", () => {
      it.skip("reverts if receiver cannot receive collateral", async () => {
        // TODO This requires the active pool to be a nonpayable address.  Skipping for now because the extra setup doesn't seem worth it.
        // THUSD Test link: https://github.com/Threshold-USD/dev/blob/develop/packages/contracts/test/DefaultPoolTest.js#L64
        await expect(
          contracts.defaultPool
            .connect(troveManagerSigner)
            .sendCollateralToActivePool(to1e18("0"), NO_GAS),
        ).to.be.revertedWith("Sending BTC failed")
      })
    })
  })

  describe("getCollateralBalance()", () => {
    it("gets the recorded collateral balance", async () => {
      expect(await contracts.defaultPool.getCollateralBalance()).to.equal(0)
    })
  })

  describe("getDebt()", () => {
    it("gets the recorded mUSD balance", async () => {
      expect(await contracts.defaultPool.getDebt()).to.equal(0)
    })
  })

  context("increaseDebt()", () => {
    it("increases the recorded mUSD balance by the correct amount", async () => {
      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "before",
        addresses,
      )
      const amount = to1e18("100")

      await contracts.defaultPool
        .connect(troveManagerSigner)
        .increaseDebt(amount, 0n, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "after",
        addresses,
      )

      expect(
        state.defaultPool.debt.after - state.defaultPool.debt.before,
      ).to.equal(amount)
    })
  })

  describe("decreaseDebt()", () => {
    it("decreases the recorded mUSD balance by the correct amount", async () => {
      const originalAmount = to1e18("200")
      await contracts.defaultPool
        .connect(troveManagerSigner)
        .increaseDebt(originalAmount, 0n, NO_GAS)

      const subtractedAmount = to1e18("50")
      await contracts.defaultPool
        .connect(troveManagerSigner)
        .decreaseDebt(subtractedAmount, 0n, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "after",
        addresses,
      )

      expect(state.defaultPool.debt.after).to.equal(
        originalAmount - subtractedAmount,
      )
    })
  })
})
