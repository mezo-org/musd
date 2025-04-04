import { expect } from "chai"
import { ethers, network } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import {
  Contracts,
  ContractsState,
  NO_GAS,
  TestingAddresses,
  User,
  calculateInterestOwed,
  fastForwardTime,
  getLatestBlockTimestamp,
  openTrove,
  setInterestRate,
  setupTests,
  updateContractsSnapshot,
  updateTroveSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"

describe("ActivePool", () => {
  let addresses: TestingAddresses
  let contracts: Contracts
  let state: ContractsState
  let alice: User
  let council: User
  let deployer: User
  let treasury: User

  let borrowerOperationsSigner: HardhatEthersSigner

  beforeEach(async () => {
    ;({ alice, council, deployer, treasury, state, contracts, addresses } =
      await setupTests())

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.borrowerOperations],
    })

    borrowerOperationsSigner = await ethers.getSigner(
      addresses.borrowerOperations,
    )

    // Setup PCV governance addresses
    await contracts.pcv
      .connect(deployer.wallet)
      .startChangingRoles(council.address, treasury.address)
    await contracts.pcv.connect(deployer.wallet).finalizeChangingRoles()
  })

  describe("getCollateralBalance()", () => {
    it("gets the recorded collateral balance", async () => {
      expect(await contracts.activePool.getCollateralBalance()).to.equal(0)
    })
  })

  describe("getDebt()", () => {
    it("gets the recorded mUSD balance", async () => {
      expect(await contracts.activePool.getDebt()).to.equal(0)
    })

    it("virtually accrues interest", async () => {
      await setInterestRate(contracts, council, 1000)

      await openTrove(contracts, {
        musdAmount: "50000",
        ICR: "800",
        sender: alice.wallet,
      })

      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      await updateTroveSnapshot(contracts, alice, "before")
      const expectedInterest = calculateInterestOwed(
        alice.trove.debt.before,
        1000,
        BigInt(alice.trove.lastInterestUpdateTime.before),
        BigInt(await getLatestBlockTimestamp()),
      )

      expect(await contracts.activePool.getDebt()).to.equal(
        alice.trove.debt.before + expectedInterest,
      )
    })
  })

  describe("getInterest()", () => {
    it("virtually accrues interest", async () => {
      await setInterestRate(contracts, council, 1000)

      await openTrove(contracts, {
        musdAmount: "50000",
        ICR: "800",
        sender: alice.wallet,
      })

      await fastForwardTime(365 * 24 * 60 * 60) // 1 year in seconds

      await updateTroveSnapshot(contracts, alice, "before")
      const expectedInterest = calculateInterestOwed(
        alice.trove.debt.before,
        1000,
        BigInt(alice.trove.lastInterestUpdateTime.before),
        BigInt(await getLatestBlockTimestamp()),
      )

      expect(await contracts.activePool.getInterest()).to.equal(
        expectedInterest,
      )
    })
  })

  describe("increaseDebt()", () => {
    it("increases the recorded mUSD balance by the correct amount", async () => {
      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )
      const amount = to1e18("100")

      await contracts.activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(amount, 0n, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(
        state.activePool.debt.after - state.activePool.debt.before,
      ).to.equal(amount)
    })
  })

  describe("decreaseDebt()", () => {
    it("decreases the recorded mUSD balance by the correct amount", async () => {
      const initialAmount = to1e18("100")

      await contracts.activePool
        .connect(borrowerOperationsSigner)
        .increaseDebt(initialAmount, 0n, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "before",
        addresses,
      )

      const subtractedAmount = to1e18("75")

      await contracts.activePool
        .connect(borrowerOperationsSigner)
        .decreaseDebt(subtractedAmount, 0n, NO_GAS)

      await updateContractsSnapshot(
        contracts,
        state,
        "activePool",
        "after",
        addresses,
      )

      expect(state.activePool.debt.after).to.equal(
        state.activePool.debt.before - subtractedAmount,
      )
    })
  })
})
