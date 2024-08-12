import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import {
  Contracts,
  ContractsState,
  TestSetup,
  TestingAddresses,
  User,
  connectContracts,
  fixture,
  getAddresses,
  getTCR,
  openTrove,
} from "../../helpers"
import { to1e18 } from "../../utils"

describe("StabilityPool in Normal Mode", () => {
  let addresses: TestingAddresses
  let alice: User
  let bob: User
  let carol: User
  let dennis: User
  let eric: User
  let frank: User
  let whale: User
  let state: ContractsState
  let contracts: Contracts
  let cachedTestSetup: TestSetup
  let testSetup: TestSetup

  const provideToSP = async (amount: bigint, user: User): Promise<void> => {
    await contracts.stabilityPool.connect(user.wallet).provideToSP(amount)
  }

  const withdrawFromSP = async (amount: bigint, user: User): Promise<void> => {
    await contracts.stabilityPool.connect(user.wallet).withdrawFromSP(amount)
  }

  const liquidate = async (): Promise<void> => {
    const priceBefore = await contracts.priceFeed.fetchPrice()
    await openTrove(contracts, {
      musdAmount: "2,000", // slightly over the minimum of $1800
      ICR: "120", // 120%
      sender: frank,
    })

    // Drop price to 90% of prior. This makes Frank's ICR equal to 108%
    // which is below the MCR of 110%
    await contracts.mockAggregator.setPrice((priceBefore * 9n) / 10n)

    // Liquidate Frank
    await contracts.troveManager.liquidate(frank.wallet)

    // Reset the price
    await contracts.mockAggregator.setPrice(priceBefore)
  }

  beforeEach(async () => {
    cachedTestSetup = await loadFixture(fixture)
    testSetup = { ...cachedTestSetup }
    contracts = testSetup.contracts
    state = testSetup.state

    await connectContracts(contracts, testSetup.users)
    alice = testSetup.users.alice
    bob = testSetup.users.bob
    carol = testSetup.users.carol
    dennis = testSetup.users.dennis
    eric = testSetup.users.eric
    frank = testSetup.users.frank
    whale = testSetup.users.whale
    addresses = await getAddresses(contracts, testSetup.users)

    // Approve each user to deposit 100k to the stability pool.
    const amount = to1e18(100_000)
    await Promise.all(
      [alice, bob, carol, dennis, eric, whale].map(async (user) => {
        await contracts.musd
          .connect(user.wallet)
          .approve(addresses.stabilityPool, amount)
      }),
    )

    // set 1 BTC = $1000 for ease of math
    await contracts.mockAggregator.setPrice(to1e18(1_000))

    // Open a trove for $5k for alice backed by $10k worth of BTC (10 BTC)
    await openTrove(contracts, {
      musdAmount: "5,000",
      ICR: "200",
      sender: alice,
    })

    await openTrove(contracts, {
      musdAmount: "30,000",
      ICR: "200",
      sender: whale,
    })

    await provideToSP(to1e18(20_000), whale)
  })

  describe("provideToSP()", () => {
    it("provideToSP(): increases the Stability Pool MUSD balance", async () => {
      const amount = to1e18(30)

      const before = await contracts.stabilityPool.getTotalMUSDDeposits()
      await provideToSP(amount, alice)

      expect(await contracts.stabilityPool.getTotalMUSDDeposits()).to.equal(
        before + amount,
      )
    })

    it("provideToSP(): updates the user's deposit record in StabilityPool", async () => {
      const amount = to1e18(200)
      await provideToSP(amount, alice)

      state.stabilityPool.deposits.after =
        await contracts.stabilityPool.deposits(alice.address)

      expect(state.stabilityPool.deposits.after).to.be.equal(amount)
    })

    it("provideToSP(): reduces the user's MUSD balance", async () => {
      const beforeBalance = await contracts.musd.balanceOf(alice.wallet)

      const amount = to1e18(200)
      await provideToSP(amount, alice)

      // check user's MUSD balance change
      const afterBalance = await contracts.musd.balanceOf(alice.wallet)

      expect(afterBalance).to.be.equal(beforeBalance - amount)
    })

    it("provideToSP(): Correctly updates user snapshots of accumulated rewards per unit staked", async () => {
      await liquidate()

      const pBefore = await contracts.stabilityPool.P()
      const sBefore = await contracts.stabilityPool.epochToScaleToSum(0, 0)

      expect(pBefore > 0n).to.equal(true)
      expect(sBefore > 0n).to.equal(true)

      // Check 'Before' snapshots
      const aliceSnapshotBefore =
        await contracts.stabilityPool.depositSnapshots(alice.wallet)

      const aliceSnapshotSBefore = aliceSnapshotBefore[0]
      const aliceSnapshotPBefore = aliceSnapshotBefore[1]

      expect(aliceSnapshotSBefore).to.equal(0n)
      expect(aliceSnapshotPBefore).to.equal(0n)

      // Make deposit
      await provideToSP(to1e18(100), alice)

      // Check 'After' snapshots
      const aliceSnapshotAfter = await contracts.stabilityPool.depositSnapshots(
        alice.wallet,
      )
      const aliceSnapshotSAfter = aliceSnapshotAfter[0]
      const aliceSnapshotPAfter = aliceSnapshotAfter[1]

      expect(aliceSnapshotSAfter).to.equal(sBefore)
      expect(aliceSnapshotPAfter).to.equal(pBefore)
    })

    it("provideToSP(): multiple deposits: updates user's deposit and snapshots", async () => {
      // Alice makes deposit #1: $1,000
      await provideToSP(to1e18(1_000), alice)

      const aliceSnapshot0 = await contracts.stabilityPool.depositSnapshots(
        alice.wallet,
      )
      const aliceSnapshotS0 = aliceSnapshot0[0]
      const aliceSnapshotP0 = aliceSnapshot0[1]

      expect(aliceSnapshotS0).to.equal(0)
      expect(aliceSnapshotP0).to.equal(to1e18(1))

      await liquidate()

      const aliceCompoundedDeposit1 =
        await contracts.stabilityPool.getCompoundedMUSDDeposit(alice.wallet)

      // Alice makes deposit #2
      const aliceTopUp1 = to1e18(100)
      await provideToSP(aliceTopUp1, alice)

      const aliceNewDeposit1 = await contracts.stabilityPool.deposits(
        alice.wallet,
      )
      expect(aliceCompoundedDeposit1 + aliceTopUp1).to.equal(aliceNewDeposit1)

      // get system reward terms
      const p1 = await contracts.stabilityPool.P()
      const s1 = await contracts.stabilityPool.epochToScaleToSum(0, 0)

      expect(p1).to.be.lessThan(to1e18(1))
      expect(s1).to.be.greaterThan(0n)

      // check that Alice's new snapshot is correct
      const aliceSnapshot1 = await contracts.stabilityPool.depositSnapshots(
        alice.wallet,
      )

      const aliceSnapshotS1 = aliceSnapshot1[0]
      const aliceSnapshotP1 = aliceSnapshot1[1]

      expect(aliceSnapshotS1).to.equal(s1)
      expect(aliceSnapshotP1).to.equal(p1)

      // Bob withdraws MUSD and deposits to StabilityPool

      await openTrove(contracts, {
        musdAmount: "3,000",
        ICR: "200",
        sender: bob,
      })
      await provideToSP(to1e18(427), bob)

      // Trigger another liquidation
      await liquidate()

      const p2 = await contracts.stabilityPool.P()
      const s2 = await contracts.stabilityPool.epochToScaleToSum(0, 0)

      expect(p2).to.be.lessThan(p1)
      expect(s2).to.be.greaterThan(s1)

      // Alice makes deposit #3: $100
      await provideToSP(to1e18(100), alice)

      // check Alice's new snapshot is correct
      const aliceSnapshot2 = await contracts.stabilityPool.depositSnapshots(
        alice.wallet,
      )

      const aliceSnapshotS2 = aliceSnapshot2[0]
      const aliceSnapshotP2 = aliceSnapshot2[1]

      expect(aliceSnapshotS2).to.equal(s2)
      expect(aliceSnapshotP2).to.equal(p2)
    })

    it("provideToSP(): reverts if user tries to provide more than their MUSD balance", async () => {
      const aliceMUSDbal = await contracts.musd.balanceOf(alice.wallet)
      await expect(provideToSP(aliceMUSDbal + 1n, alice)).to.be.reverted
    })

    it("provideToSP(): reverts if user tries to provide 2^256-1 MUSD, which exceeds their balance", async () => {
      // Alice attempts to deposit 2^256-1 MUSD
      const maxBytes32 = BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )
      await expect(provideToSP(maxBytes32, alice)).to.be.reverted
    })

    context("No unexpected state changes", async () => {
      beforeEach(async () => {
        // Bob and Carol open troves and make Stability Pool deposits
        await Promise.all(
          [bob, carol].map(async (user) => {
            const amount = to1e18(5_000)
            await openTrove(contracts, {
              musdAmount: amount,
              ICR: "200",
              sender: user,
            })

            await provideToSP(amount, user)
          }),
        )

        // Dennis opens a trove but does not make a Stability Pool deposit
        await openTrove(contracts, {
          musdAmount: "2,000",
          ICR: "200",
          sender: dennis,
        })

        await liquidate()
      })

      it("provideToSP(): doesn't impact other users' deposits or collateral gains", async () => {
        const users = [alice, bob, carol]
        const fetchState = async () =>
          Promise.all(
            users.map(async (user) => ({
              musd: await contracts.stabilityPool.getCompoundedMUSDDeposit(
                user.wallet,
              ),
              collateralGain:
                await contracts.stabilityPool.getDepositorCollateralGain(
                  user.wallet,
                ),
            })),
          )

        const beforeState = await fetchState()

        // Dennis provides $1,000 to the stability pool.
        await provideToSP(to1e18(1_000), dennis)
        expect(
          (
            await contracts.stabilityPool.getCompoundedMUSDDeposit(
              dennis.wallet,
            )
          ).toString(),
        ).to.equal(to1e18(1_000))

        const afterState = await fetchState()

        afterState.forEach(async (afterUserState, index) => {
          const beforeUserState = beforeState[index]

          expect(beforeUserState.musd).to.equal(afterUserState.musd)
          expect(beforeUserState.collateralGain).to.equal(
            afterUserState.collateralGain,
          )
        })
      })

      it("provideToSP(): doesn't impact system debt, collateral or TCR", async () => {
        const fetchState = async () => ({
          activeDebt: await contracts.activePool.getMUSDDebt(),
          defaultedDebt: await contracts.defaultPool.getMUSDDebt(),
          activeCollateral: await contracts.activePool.getCollateralBalance(),
          defaultedCollateral:
            await contracts.defaultPool.getCollateralBalance(),
          TCR: await getTCR(contracts),
        })

        const beforeState = await fetchState()

        // Dennis provides $1,000 to the stability pool.
        await provideToSP(to1e18(1_000), dennis)
        expect(
          (
            await contracts.stabilityPool.getCompoundedMUSDDeposit(
              dennis.wallet,
            )
          ).toString(),
        ).to.equal(to1e18(1_000))

        const afterState = await fetchState()

        expect(beforeState.activeDebt).to.equal(afterState.activeDebt)
        expect(beforeState.defaultedDebt).to.equal(afterState.defaultedDebt)
        expect(beforeState.activeCollateral).to.equal(
          afterState.activeCollateral,
        )
        expect(beforeState.defaultedCollateral).to.equal(
          afterState.defaultedCollateral,
        )
        expect(beforeState.TCR).to.equal(afterState.TCR)
      })

      it("provideToSP(): doesn't impact any troves, including the caller's trove", async () => {
        const users = [whale, alice, bob, carol, dennis]
        const price = await contracts.priceFeed.fetchPrice()
        const fetchState = async () =>
          Promise.all(
            users.map(async (user) => {
              const [debt, collateral] = await contracts.troveManager.Troves(
                user.wallet,
              )
              return {
                debt,
                collateral,
                ICR: await contracts.troveManager.getCurrentICR(
                  whale.wallet,
                  price,
                ),
              }
            }),
          )
        const beforeState = await fetchState()

        // Dennis provides $1,000 to the stability pool.
        await provideToSP(to1e18(1_000), dennis)
        expect(
          await contracts.stabilityPool.getCompoundedMUSDDeposit(dennis.wallet),
        ).to.equal(to1e18(1_000))

        const afterState = await fetchState()

        afterState.forEach((afterUserState, index) => {
          const beforeUserState = beforeState[index]
          expect(beforeUserState.debt).to.equal(afterUserState.debt)
          expect(beforeUserState.collateral).to.equal(afterUserState.collateral)
          expect(beforeUserState.ICR).to.equal(afterUserState.ICR)
        })
      })
    })

    it("provideToSP(): doesn't protect the depositor's trove from liquidation", async () => {
      await openTrove(contracts, {
        musdAmount: "2,000",
        ICR: "120",
        sender: bob,
      })
      await provideToSP(to1e18(2_000), bob)

      // Price drops from $1,000 to $900
      await contracts.mockAggregator.setPrice(to1e18(900))

      // Liquidate bob
      await contracts.troveManager.liquidate(bob.wallet)

      // Check Bob's trove has been removed from the system
      expect(await contracts.sortedTroves.contains(bob.wallet)).to.equal(false)

      // check Bob's trove status was closed by liquidation
      expect(
        (await contracts.troveManager.getTroveStatus(bob.wallet)).toString(),
      ).to.equal("3")
    })

    it("provideToSP(): providing $0 reverts", async () => {
      await expect(provideToSP(0n, bob)).to.be.reverted
    })

    it("provideToSP(): new deposit; depositor does not receive collateral gains", async () => {
      await liquidate()

      // Alice deposits to the Pool
      await provideToSP(to1e18(2_000), alice)

      expect(
        await contracts.stabilityPool.getDepositorCollateralGain(alice.wallet),
      ).to.equal(0n)
    })

    it("provideToSP(): new deposit after past full withdrawal; depositor does not receive collateral gains", async () => {
      // Alice enters and then exits the pool
      const amount = to1e18(2_000)
      await provideToSP(amount, alice)
      await withdrawFromSP(amount, alice)

      await liquidate()

      // Alice deposits to the Pool
      await provideToSP(amount, alice)

      expect(
        await contracts.stabilityPool.getDepositorCollateralGain(alice.wallet),
      ).to.equal(0n)
    })
  })
})
