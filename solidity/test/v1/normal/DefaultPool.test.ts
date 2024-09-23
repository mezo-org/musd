import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { ethers, network } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  connectContracts,
  Contracts,
  ContractsState,
  fixture,
  getAddresses,
  NO_GAS,
  TestingAddresses,
  TestSetup,
  updateContractsSnapshot,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("DefaultPool", () => {
  let addresses: TestingAddresses
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let state: ContractsState
  let testSetup: TestSetup

  let activePoolSigner: HardhatEthersSigner
  let troveManagerSigner: HardhatEthersSigner

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    state = testSetup.state

    await connectContracts(contracts, testSetup.users)
    addresses = await getAddresses(contracts, testSetup.users)

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.troveManager],
    })

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.activePool],
    })

    activePoolSigner = await ethers.getSigner(addresses.activePool)
    troveManagerSigner = await ethers.getSigner(addresses.troveManager)
  })

  /**
   *
   * Expected Reverts
   *
   */
  context("Expected Reverts", () => {
    it("updateCollateralBalance(): fails if pool receives token", async () => {
      await expect(
        contracts.defaultPool
          .connect(activePoolSigner)
          .updateCollateralBalance(0, NO_GAS),
      ).to.be.revertedWith("DefaultPool: BTC collateral needed, not ERC20")
    })

    it.skip("sendCollateralToActivePool(): fails if receiver cannot receive collateral", async () => {
      // TODO This requires the active pool to be a nonpayable address.  Skipping for now because the extra setup doesn't seem worth it.
      // THUSD Test link: https://github.com/Threshold-USD/dev/blob/develop/packages/contracts/test/DefaultPoolTest.js#L64
      await expect(
        contracts.defaultPool
          .connect(troveManagerSigner)
          .sendCollateralToActivePool(to1e18("0"), NO_GAS),
      ).to.be.revertedWith("Sending BTC failed")
    })
  })

  /**
   *
   * Emitted Events
   *
   */
  context("Emitted Events", () => {})

  /**
   *
   * System State Changes
   *
   */
  context("System State Changes", () => {})

  /**
   *
   * Individual Troves
   *
   */
  context("Individual Troves", () => {})

  /**
   *
   * Balance changes
   *
   */
  context("Balance changes", () => {
    it("getCollateralBalance(): gets the recorded collateral balance", async () => {
      expect(await contracts.defaultPool.getCollateralBalance()).to.equal(0)
    })

    it("getMUSDDebt(): gets the recorded MUSD balance", async () => {
      expect(await contracts.defaultPool.getMUSDDebt()).to.equal(0)
    })

    it("increaseMUSDDebt(): increases the recorded MUSD balance by the correct amount", async () => {
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
        .increaseMUSDDebt(amount, NO_GAS)

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

    it("decreaseMUSDDebt(): decreases the recorded THUSD balance by the correct amount", async () => {
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
        .increaseMUSDDebt(amount, NO_GAS)

      await contracts.defaultPool
        .connect(troveManagerSigner)
        .decreaseMUSDDebt(amount, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "defaultPool",
        "after",
        addresses,
      )

      expect(state.defaultPool.debt.before).to.equal(
        state.defaultPool.debt.after,
      )
    })
  })

  /**
   *
   * Fees
   *
   */
  context("Fees", () => {})

  /**
   *
   * State change in other contracts
   *
   */
  context("State change in other contracts", () => {})
})
