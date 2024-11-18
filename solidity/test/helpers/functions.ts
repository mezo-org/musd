/* eslint no-param-reassign: ["error", { "props": false }] */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { ContractTransactionResponse, LogDescription } from "ethers"
import { ethers, helpers } from "hardhat"
import { assert, expect } from "chai"
import { GOVERNANCE_TIME_DELAY, to1e18, ZERO_ADDRESS } from "../utils"
import {
  AddCollParams,
  Contracts,
  ContractsState,
  OpenTroveParams,
  TestingAddresses,
  User,
  WithdrawCollParams,
} from "./interfaces"
import { fastForwardTime } from "./time"
import {
  beforeAndAfter,
  connectContracts,
  getAddresses,
  loadTestSetup,
} from "./context"

export const NO_GAS = {
  maxFeePerGas: 0,
  maxPriorityFeePerGas: 0,
}

// Contract specific helper functions
export async function removeMintlist(
  contracts: Contracts,
  owner: HardhatEthersSigner,
) {
  await contracts.musd
    .connect(owner)
    .startRevokeMintList(await contracts.borrowerOperations.getAddress())
  await fastForwardTime(GOVERNANCE_TIME_DELAY + 1)
  await contracts.musd.connect(owner).finalizeRevokeMintList()
}

/*
 * given the requested mUSD amount in openTrove, returns the total debt
 * So, it adds the gas compensation and the borrowing fee
 */
export async function getOpenTroveTotalDebt(
  contracts: Contracts,
  musdAmount: bigint,
) {
  const fee = await contracts.troveManager.getBorrowingFee(musdAmount)
  const price = await contracts.priceFeed.fetchPrice()
  const recoveryMode = await contracts.troveManager.checkRecoveryMode(price)
  const compositeDebt =
    await contracts.borrowerOperations.getCompositeDebt(musdAmount)

  if (recoveryMode) {
    return compositeDebt
  }
  return compositeDebt + fee
}

export async function getTCR(contracts: Contracts) {
  const price = await contracts.priceFeed.fetchPrice()
  return contracts.troveManager.getTCR(price)
}

export type CheckPoint = "before" | "after"

export async function updateCollSurplusSnapshot(
  contracts: Contracts,
  state: ContractsState,
  checkPoint: CheckPoint,
) {
  state.collSurplusPool.collateral[checkPoint] =
    await contracts.collSurplusPool.getCollateralBalance()
}

export async function updateCollSurplusPoolUserSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  user.collSurplusPool.collateral[checkPoint] =
    await contracts.collSurplusPool.getCollateral(user.wallet)
}

export async function updateTroveSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  const [
    collateral,
    debt,
    interestOwed,
    stake,
    status,
    interestRate,
    lastInterestUpdateTime,
    maxBorrowingCapacity,
    arrayIndex,
  ] = await contracts.troveManager.Troves(user.address)

  const price = await contracts.priceFeed.fetchPrice()
  const icr = await contracts.troveManager.getCurrentICR(user.address, price)

  user.trove.collateral[checkPoint] = collateral
  user.trove.debt[checkPoint] = debt
  user.trove.interestOwed[checkPoint] = interestOwed
  user.trove.stake[checkPoint] = stake
  user.trove.status[checkPoint] = status
  user.trove.interestRate[checkPoint] = interestRate
  user.trove.lastInterestUpdateTime[checkPoint] = lastInterestUpdateTime
  user.trove.maxBorrowingCapacity[checkPoint] = maxBorrowingCapacity
  user.trove.arrayIndex[checkPoint] = arrayIndex
  user.trove.icr[checkPoint] = icr
}

export async function updateTroveSnapshots(
  contracts: Contracts,
  users: User[],
  checkPoint: CheckPoint,
) {
  await Promise.all(
    users.map((user) => updateTroveSnapshot(contracts, user, checkPoint)),
  )
}

/* Updates the snapshot of collateral and btc for either active pool or default pool.
 * In the future we can potentially include more state updates to contracts but want to avoid too much coupling for now.
 */
export async function updateContractsSnapshot(
  contracts: Contracts,
  state: ContractsState,
  pool: "activePool" | "defaultPool",
  checkPoint: CheckPoint,
  addresses: TestingAddresses,
) {
  state[pool].collateral[checkPoint] =
    await contracts[pool].getCollateralBalance()
  state[pool].btc[checkPoint] = await ethers.provider.getBalance(
    addresses[pool],
  )
  state[pool].debt[checkPoint] = await contracts[pool].getMUSDDebt()
  state[pool].principal[checkPoint] = await contracts[pool].getPrincipal()
  state[pool].interest[checkPoint] = await contracts[pool].getInterest()
}

export async function updatePCVSnapshot(
  contracts: Contracts,
  state: ContractsState,
  checkPoint: CheckPoint,
) {
  state.pcv.collateral[checkPoint] = await ethers.provider.getBalance(
    await contracts.pcv.getAddress(),
  )
  // More fields can be added as needed
}

export async function updateInterestRateDataSnapshot(
  contracts: Contracts,
  state: ContractsState,
  interestRate: number,
  checkPoint: CheckPoint,
) {
  const { principal, interest, lastUpdatedTime } =
    await contracts.troveManager.interestRateData(interestRate)

  const data = state.troveManager.interestRateData[interestRate] ?? {}

  data.principal ??= beforeAndAfter()
  data.principal[checkPoint] = principal

  data.interest ??= beforeAndAfter()
  data.interest[checkPoint] = interest

  data.lastUpdatedTime ??= beforeAndAfter()
  data.lastUpdatedTime[checkPoint] = lastUpdatedTime

  state.troveManager.interestRateData[interestRate] = data
}

export async function updatePendingSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  const collateral = await contracts.troveManager.getPendingCollateralReward(
    user.address,
  )
  const debt = await contracts.troveManager.getPendingMUSDDebtReward(
    user.address,
  )
  user.pending.collateral[checkPoint] = collateral
  user.pending.debt[checkPoint] = debt
}

export async function updatePendingSnapshots(
  contracts: Contracts,
  users: User[],
  checkPoint: CheckPoint,
) {
  return Promise.all(
    users.map((user) => updatePendingSnapshot(contracts, user, checkPoint)),
  )
}

export async function updateRewardSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  const [collateral, debt] = await contracts.troveManager.rewardSnapshots(
    user.address,
  )

  user.rewardSnapshot.collateral[checkPoint] = collateral
  user.rewardSnapshot.debt[checkPoint] = debt
}

export async function updateStabilityPoolSnapshot(
  contracts: Contracts,
  state: ContractsState,
  checkPoint: CheckPoint,
) {
  state.stabilityPool.collateral[checkPoint] =
    await contracts.stabilityPool.getCollateralBalance()
  state.stabilityPool.musd[checkPoint] =
    await contracts.stabilityPool.getTotalMUSDDeposits()
  state.stabilityPool.P[checkPoint] = await contracts.stabilityPool.P()
  state.stabilityPool.S[checkPoint] =
    await contracts.stabilityPool.epochToScaleToSum(0, 0)
  state.stabilityPool.currentEpoch[checkPoint] =
    await contracts.stabilityPool.currentEpoch()
  state.stabilityPool.currentScale[checkPoint] =
    await contracts.stabilityPool.currentScale()
}

export async function updateStabilityPoolUserSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  user.stabilityPool.compoundedDeposit[checkPoint] =
    await contracts.stabilityPool.getCompoundedMUSDDeposit(user.wallet)
  user.stabilityPool.deposit[checkPoint] =
    await contracts.stabilityPool.deposits(user.wallet)
  user.stabilityPool.collateralGain[checkPoint] =
    await contracts.stabilityPool.getDepositorCollateralGain(user.wallet)

  const [S, P] = await contracts.stabilityPool.depositSnapshots(user.wallet)

  user.stabilityPool.P[checkPoint] = P
  user.stabilityPool.S[checkPoint] = S
}

export async function updateStabilityPoolUserSnapshots(
  contracts: Contracts,
  users: User[],
  checkPoint: CheckPoint,
) {
  await Promise.all(
    users.map((user) =>
      updateStabilityPoolUserSnapshot(contracts, user, checkPoint),
    ),
  )
}

export async function updateWalletSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  user.musd[checkPoint] = await contracts.musd.balanceOf(user.wallet)
  user.btc[checkPoint] = await ethers.provider.getBalance(user.address)
}

export async function updateTroveManagerSnapshot(
  contracts: Contracts,
  state: ContractsState,
  checkPoint: CheckPoint,
) {
  state.troveManager.TCR[checkPoint] = await getTCR(contracts)
  state.troveManager.stakes[checkPoint] =
    await contracts.troveManager.totalStakes()
  state.troveManager.collateralSnapshot[checkPoint] =
    await contracts.troveManager.totalCollateralSnapshot()
  state.troveManager.stakesSnapshot[checkPoint] =
    await contracts.troveManager.totalStakesSnapshot()
  state.troveManager.troves[checkPoint] =
    await contracts.troveManager.getTroveOwnersCount()
  state.troveManager.baseRate[checkPoint] =
    await contracts.troveManager.baseRate()
  state.troveManager.lastFeeOperationTime[checkPoint] =
    await contracts.troveManager.lastFeeOperationTime()
}

export async function getTroveEntireColl(
  contracts: Contracts,
  address: HardhatEthersSigner,
) {
  const { coll } = await contracts.troveManager.getEntireDebtAndColl(address)
  return coll
}

export async function getTroveEntireDebt(
  contracts: Contracts,
  address: HardhatEthersSigner,
) {
  const { principal, interest } =
    await contracts.troveManager.getEntireDebtAndColl(address)
  return principal + interest
}

export async function getAllEventsByName(
  tx: ContractTransactionResponse,
  abi: Array<string>,
  eventName: string,
) {
  const txReceipt = await tx.wait()
  const iface = new ethers.Interface(abi)
  const events = []

  if (txReceipt) {
    // eslint-disable-next-line no-restricted-syntax
    for (const log of txReceipt.logs) {
      try {
        const parsedLog = iface.parseLog(log)
        if (parsedLog && parsedLog.name === eventName) {
          events.push(parsedLog)
        }
      } catch (error) {
        // continue if the log does not match the event
      }
    }
  }
  return events
}

export async function getEventArgByName(
  tx: ContractTransactionResponse,
  abi: Array<string>,
  eventName: string,
  argIndex: number,
) {
  const events = await getAllEventsByName(tx, abi, eventName)
  if (events.length > 0) {
    return events[0].args[argIndex]
  }
  throw new Error(
    `The transaction logs do not contain event ${eventName} and arg ${argIndex}`,
  )
}

export async function getEmittedRedemptionValues(
  redemptionTx: ContractTransactionResponse,
) {
  const abi = [
    "event Redemption(uint256 _attemptedMUSDAmount,uint256 _actualMUSDAmount,uint256 _collateralSent,uint256 _collateralFee)",
  ]

  const attemptedMUSDAmount = await getEventArgByName(
    redemptionTx,
    abi,
    "Redemption",
    0,
  )

  const actualMUSDAmount = await getEventArgByName(
    redemptionTx,
    abi,
    "Redemption",
    1,
  )

  const collateralSent = await getEventArgByName(
    redemptionTx,
    abi,
    "Redemption",
    2,
  )

  const collateralFee = await getEventArgByName(
    redemptionTx,
    abi,
    "Redemption",
    3,
  )

  return {
    attemptedMUSDAmount,
    actualMUSDAmount,
    collateralSent,
    collateralFee,
  }
}

export async function getDebtAndCollFromTroveUpdatedEvents(
  troveUpdatedEvents: LogDescription[],
  user: User,
) {
  const event = troveUpdatedEvents.find((e) => e.args[0] === user.address)
  return {
    debt: event?.args[1],
    coll: event?.args[2],
  }
}

export async function getEmittedLiquidationValues(
  liquidationTx: ContractTransactionResponse,
) {
  const abi = [
    "event Liquidation(uint256 _liquidatedDebt, uint256 _liquidatedColl, uint256 _collGasCompensation, uint256 _MUSDGasCompensation)",
  ]

  const liquidatedDebt = await getEventArgByName(
    liquidationTx,
    abi,
    "Liquidation",
    0,
  )

  const liquidatedColl = await getEventArgByName(
    liquidationTx,
    abi,
    "Liquidation",
    1,
  )

  const collGasCompensation = await getEventArgByName(
    liquidationTx,
    abi,
    "Liquidation",
    2,
  )

  const MUSDGasCompensation = await getEventArgByName(
    liquidationTx,
    abi,
    "Liquidation",
    3,
  )

  return {
    liquidatedDebt,
    liquidatedColl,
    collGasCompensation,
    MUSDGasCompensation,
  }
}

export async function addColl(contracts: Contracts, inputs: AddCollParams) {
  const params = inputs

  const amount =
    typeof params.amount === "bigint" ? params.amount : to1e18(params.amount)

  // fill in hints for searching trove list if not provided
  params.lowerHint =
    inputs.lowerHint === undefined ? ZERO_ADDRESS : inputs.lowerHint
  params.upperHint =
    inputs.upperHint === undefined ? ZERO_ADDRESS : inputs.upperHint

  return contracts.borrowerOperations
    .connect(inputs.sender)
    .addColl(amount, params.lowerHint, params.upperHint, {
      value: amount, // The amount of chain base asset to send
    })
}

export async function withdrawColl(
  contracts: Contracts,
  inputs: WithdrawCollParams,
) {
  const params = inputs

  const amount =
    typeof params.amount === "bigint" ? params.amount : to1e18(params.amount)

  // fill in hints for searching trove list if not provided
  params.lowerHint =
    inputs.lowerHint === undefined ? ZERO_ADDRESS : inputs.lowerHint
  params.upperHint =
    inputs.upperHint === undefined ? ZERO_ADDRESS : inputs.upperHint

  return contracts.borrowerOperations
    .connect(inputs.sender)
    .withdrawColl(amount, params.lowerHint, params.upperHint)
}

// Withdraw mUSD from a trove to make ICR equal to the target ICR
export async function adjustTroveToICR(
  contracts: Contracts,
  from: HardhatEthersSigner,
  targetICR: bigint,
) {
  const { principal, interest, coll } =
    await contracts.troveManager.getEntireDebtAndColl(from)
  const debt = principal + interest
  const price = await contracts.priceFeed.fetchPrice()

  // Calculate the debt required to reach the target ICR
  const targetDebt = (coll * price) / targetICR
  const increasedTotalDebt = targetDebt - debt
  const borrowingRate = await contracts.troveManager.getBorrowingRate()

  /* Total increase in debt after the call = targetDebt - debt
   * Requested increase in debt factors in the borrow fee, note you must multiply by to1e18(1) before the division to avoid rounding errors
   */
  const requestedDebtIncrease =
    ((targetDebt - debt) * to1e18(1)) / (to1e18(1) + borrowingRate)

  await contracts.borrowerOperations
    .connect(from)
    .withdrawMUSD(
      to1e18("100") / 100n,
      requestedDebtIncrease,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
    )

  return { requestedDebtIncrease, increasedTotalDebt }
}

export async function openTrove(contracts: Contracts, inputs: OpenTroveParams) {
  const params = inputs

  // fill in hints for searching trove list if not provided
  if (params.lowerHint === undefined) params.lowerHint = ZERO_ADDRESS
  if (params.upperHint === undefined) params.upperHint = ZERO_ADDRESS

  // open minimum debt amount unless extraMUSDAmount is specificed.
  // if (!params.musdAmount) params.musdAmount = (await contracts.borrowerOperations.MIN_NET_DEBT()) + 1n // add 1 to avoid rounding issues

  // max fee size cant exceed 100%
  if (params.maxFeePercentage === undefined) params.maxFeePercentage = "100"
  const maxFeePercentage = to1e18(params.maxFeePercentage) / 100n

  // ICR default of 150%
  if (params.ICR === undefined) params.ICR = "200"
  const ICR = to1e18(params.ICR) / 100n // 1e18 = 100%

  const musdAmount =
    typeof params.musdAmount === "bigint"
      ? params.musdAmount
      : to1e18(params.musdAmount)

  const price = await contracts.priceFeed.fetchPrice()

  // amount of debt to take on
  const totalDebt = await getOpenTroveTotalDebt(contracts, musdAmount)
  const netDebt =
    totalDebt - (await contracts.troveManager.getMUSDGasCompensation())

  // amount of assets required for the loan
  const assetAmount = (ICR * totalDebt) / price

  const tx = await contracts.borrowerOperations
    .connect(params.sender)
    .openTrove(
      maxFeePercentage,
      musdAmount,
      assetAmount,
      params.upperHint,
      params.lowerHint,
      {
        value: assetAmount, // The amount of chain base asset to send
      },
    )

  return {
    musdAmount,
    totalDebt,
    collateral: assetAmount,
    tx,
    netDebt,
  }
}

export function openTroves(
  contracts: Contracts,
  users: User[],
  amount: bigint | string,
  icr: string,
) {
  return Promise.all(
    users.map((user) =>
      openTrove(contracts, {
        musdAmount: amount,
        ICR: icr,
        sender: user.wallet,
      }),
    ),
  )
}

export async function createLiquidationEvent(
  contracts: Contracts,
  amount: string | bigint = "2,000",
): Promise<ContractTransactionResponse> {
  const bigintAmount = typeof amount === "string" ? to1e18(amount) : amount
  const priceBefore = await contracts.priceFeed.fetchPrice()
  const defaulter = (await helpers.signers.getUnnamedSigners())[8]

  await openTrove(contracts, {
    musdAmount: bigintAmount,
    ICR: "120", // 120%
    sender: defaulter,
  })

  // Drop price to 90% of prior. This makes the defaulter's ICR equal to 108%
  // which is below the MCR of 110%
  await contracts.mockAggregator.setPrice((priceBefore * 9n) / 10n)

  // Liquidate defaulter
  const tx = await contracts.troveManager.liquidate(defaulter)

  // Reset the price
  await contracts.mockAggregator.setPrice(priceBefore)

  return tx
}

export function applyLiquidationFee(collateralAmount: bigint) {
  const liquidationFee = to1e18(99.5) / 100n // 0.5% liquidation fee
  return (collateralAmount * liquidationFee) / to1e18(1)
}

export async function provideToSP(
  contracts: Contracts,
  user: User,
  amount: bigint | string,
) {
  const bigintAmount = typeof amount === "bigint" ? amount : to1e18(amount)
  const stabilityPoolAddress = await contracts.stabilityPool.getAddress()
  await contracts.musd
    .connect(user.wallet)
    .approve(stabilityPoolAddress, bigintAmount, NO_GAS)
  await contracts.stabilityPool
    .connect(user.wallet)
    .provideToSP(bigintAmount, NO_GAS)
}

export async function openTroveAndProvideStability(
  contracts: Contracts,
  user: User,
  amount: string | bigint,
  icr: string,
) {
  await openTrove(contracts, {
    musdAmount: amount,
    ICR: icr,
    sender: user.wallet,
  })
  await provideToSP(contracts, user, amount)
}

export async function openTrovesAndProvideStability(
  contracts: Contracts,
  users: User[],
  amount: string | bigint,
  icr: string,
) {
  await openTroves(contracts, users, amount, icr)
  return Promise.all(users.map((user) => provideToSP(contracts, user, amount)))
}

export function withdrawCollateralGainToTrove(
  contracts: Contracts,
  user: User,
) {
  return contracts.stabilityPool
    .connect(user.wallet)
    .withdrawCollateralGainToTrove(ZERO_ADDRESS, ZERO_ADDRESS, NO_GAS)
}

export function withdrawCollateralGainToTroves(
  contracts: Contracts,
  users: User[],
) {
  return Promise.all(
    users.map((user) =>
      contracts.stabilityPool
        .connect(user.wallet)
        .withdrawCollateralGainToTrove(ZERO_ADDRESS, ZERO_ADDRESS, NO_GAS),
    ),
  )
}

/*
 * Drop the price enough to bring the provided user's ICR to the target ICR or to just below the MCR if no target
 * is provided.
 */
export async function dropPrice(
  contracts: Contracts,
  user: User,
  targetICR?: bigint,
) {
  const currentPrice = await contracts.priceFeed.fetchPrice()
  const icr = await contracts.troveManager.getCurrentICR(
    user.wallet,
    currentPrice,
  )

  // If none provided, set target ICR to just slightly less than MCR
  const target = targetICR
    ? targetICR / 100n
    : (await contracts.troveManager.MCR()) - 1n

  const newPrice = (target * currentPrice) / icr
  await contracts.mockAggregator.setPrice(newPrice)

  return newPrice
}

/*
 * Drop the price enough to liquidate the provided user.  If `performLiquidation` is true, liquidate the user.
 * Returns the new price and the liquidation transaction (if performed).
 */
export async function dropPriceAndLiquidate(
  contracts: Contracts,
  user: User,
  performLiquidation: boolean = true,
) {
  const newPrice = await dropPrice(contracts, user)
  const liquidationTx = performLiquidation
    ? await contracts.troveManager.liquidate(user.address)
    : null

  return { newPrice, liquidationTx }
}

/*
 * Check if the trove for the given user has the provided status and whether or not it is in the sorted list.
 * Defaults to the values for checking if a trove has been closed by liquidation.
 * */
export async function checkTroveStatus(
  contracts: Contracts,
  user: User,
  statusToCheck: bigint,
  isInSortedList: boolean,
) {
  const status = await contracts.troveManager.getTroveStatus(user.wallet)
  const inSortedList = await contracts.sortedTroves.contains(user.wallet)
  return status === statusToCheck && isInSortedList === inSortedList
}

export async function checkTroveActive(contracts: Contracts, user: User) {
  return checkTroveStatus(contracts, user, 1n, true)
}

export async function checkTroveClosedByRedemption(
  contracts: Contracts,
  user: User,
) {
  return checkTroveStatus(contracts, user, 4n, false)
}

export async function checkTroveClosedByLiquidation(
  contracts: Contracts,
  user: User,
) {
  return checkTroveStatus(contracts, user, 3n, false)
}

export function transferMUSD(
  contracts: Contracts,
  sender: User,
  receiver: User,
  amount: bigint,
) {
  return contracts.musd
    .connect(sender.wallet)
    .transfer(receiver.wallet, amount, NO_GAS)
}

export async function setBaseRate(contracts: Contracts, rate: bigint) {
  if ("setBaseRate" in contracts.troveManager) {
    await contracts.troveManager.setBaseRate(rate)
    await contracts.troveManager.setLastFeeOpTimeToNow()
  } else {
    assert.fail("TroveManagerTester not loaded")
  }
}

export async function setupTests() {
  const testSetup = await loadTestSetup()
  const { contracts, state } = testSetup

  await connectContracts(contracts, testSetup.users)

  // users
  const {
    alice,
    bob,
    carol,
    council,
    dennis,
    deployer,
    eric,
    frank,
    treasury,
    whale,
  } = testSetup.users

  // readability helper
  const addresses = await getAddresses(contracts, testSetup.users)

  return {
    contracts,
    state,
    testSetup,
    addresses,
    alice,
    bob,
    carol,
    council,
    dennis,
    deployer,
    eric,
    frank,
    treasury,
    whale,
  }
}

export function expectedCollRewardAmount(
  userColl: bigint,
  liquidatedColl: bigint,
  totalColl: bigint,
): bigint {
  return (applyLiquidationFee(liquidatedColl) * userColl) / totalColl
}

export function expectedDebtRewardAmount(
  userColl: bigint,
  liquidatedDebt: bigint,
  totalColl: bigint,
): bigint {
  return (userColl * liquidatedDebt) / totalColl
}

type RewardForUser = {
  collateral: bigint
  debt: bigint
}
export const expectedRewardAmountForUser =
  (contracts: Contracts) =>
  async (
    user: User,
    liquidatedUser: User,
    allUsers: User[],
  ): Promise<RewardForUser> => {
    // Get the total collateral of all users except the liquidated user
    const totalColl = (
      await Promise.all(
        allUsers.map((u) => getTroveEntireColl(contracts, u.wallet)),
      )
    ).reduce((acc, coll) => acc + coll, 0n)

    // Get collateral to be liquidated
    const collateralToLiquidate = await getTroveEntireColl(
      contracts,
      liquidatedUser.wallet,
    )

    const debtToLiquidate = await getTroveEntireDebt(
      contracts,
      liquidatedUser.wallet,
    )

    const remainingColl = totalColl - collateralToLiquidate

    const userCollateral = await getTroveEntireColl(contracts, user.wallet)

    const collateral = expectedCollRewardAmount(
      userCollateral,
      collateralToLiquidate,
      remainingColl,
    )

    const debt = expectedDebtRewardAmount(
      userCollateral,
      debtToLiquidate,
      remainingColl,
    )

    // Calculate expected reward amount for user based on their share of total collateral
    return {
      collateral,
      debt,
    }
  }

export const expectedRewardAmountForUsers =
  (contracts: Contracts) =>
  async (
    liquidatedUser: User,
    users: User[],
  ): Promise<Record<string, RewardForUser>> => {
    // Map over all users and calculate expected reward amount for each user
    const rewards = await Promise.all(
      users.map(async (user) => [
        user.address,
        await expectedRewardAmountForUser(contracts)(
          user,
          liquidatedUser,
          users,
        ),
      ]),
    )
    return Object.fromEntries(rewards)
  }

export const calculateSystemCollFromUsers =
  (contracts: Contracts) =>
  async (users: User[]): Promise<bigint> => {
    const collArray = await Promise.all(
      users.map((user) => getTroveEntireColl(contracts, user.wallet)),
    )
    return collArray.reduce((acc, coll) => acc + coll, 0n)
  }

export async function getRedemptionHints(
  contracts: Contracts,
  user: User,
  redemptionAmount: bigint,
  price: bigint,
) {
  const { firstRedemptionHint, partialRedemptionHintNICR } =
    await contracts.hintHelpers.getRedemptionHints(redemptionAmount, price, 0)

  const { 0: upperPartialRedemptionHint, 1: lowerPartialRedemptionHint } =
    await contracts.sortedTroves.findInsertPosition(
      partialRedemptionHintNICR,
      user.wallet,
      user.wallet,
    )

  return {
    firstRedemptionHint,
    partialRedemptionHintNICR,
    upperPartialRedemptionHint,
    lowerPartialRedemptionHint,
  }
}

export async function performRedemption(
  contracts: Contracts,
  redeemingUser: User,
  redeemedUser: User,
  redemptionAmount: bigint,
  maxIterations: number = 0,
) {
  const price = await contracts.priceFeed.fetchPrice()

  const {
    firstRedemptionHint,
    partialRedemptionHintNICR,
    upperPartialRedemptionHint,
    lowerPartialRedemptionHint,
  } = await getRedemptionHints(contracts, redeemedUser, redemptionAmount, price)

  // Don't pay for gas to make it easier to calculate the received collateral
  return contracts.troveManager
    .connect(redeemingUser.wallet)
    .redeemCollateral(
      redemptionAmount,
      firstRedemptionHint,
      upperPartialRedemptionHint,
      lowerPartialRedemptionHint,
      partialRedemptionHintNICR,
      maxIterations,
      to1e18("1"),
      NO_GAS,
    )
}

export function calculateInterestOwed(
  principal: bigint,
  interestRateBips: number,
  startTimeSeconds: bigint,
  endTimeSeconds: bigint,
) {
  const elapsedSeconds = endTimeSeconds - startTimeSeconds
  const secondsInOneYear = 31536000n

  return (
    (principal * BigInt(interestRateBips) * elapsedSeconds) /
    (10000n * secondsInOneYear)
  )
}

export async function setInterestRate(
  contracts: Contracts,
  sender: User,
  interestRate: number,
) {
  await contracts.troveManager
    .connect(sender.wallet)
    .proposeInterestRate(interestRate)
  const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
  await fastForwardTime(timeToIncrease)
  await contracts.troveManager.connect(sender.wallet).approveInterestRate()
}

export async function testUpdatesInterestOwed(
  contracts: Contracts,
  user: User,
  governance: User,
  fn: () => Promise<ContractTransactionResponse>,
) {
  await setInterestRate(contracts, governance, 100)
  await openTrove(contracts, {
    musdAmount: "50,000",
    ICR: "1000",
    sender: user.wallet,
  })
  await updateTroveSnapshot(contracts, user, "before")

  await fn()

  await fastForwardTime(60 * 60 * 24 * 7) // fast-forward one week

  await updateTroveSnapshot(contracts, user, "after")

  expect(user.trove.interestOwed.after).to.equal(
    user.trove.interestOwed.before +
      calculateInterestOwed(
        user.trove.debt.before,
        100,
        user.trove.lastInterestUpdateTime.before,
        user.trove.lastInterestUpdateTime.after,
      ),
  )
}

export async function testUpdatesSystemInterestOwed(
  contracts: Contracts,
  state: ContractsState,
  userA: User,
  userB: User,
  governance: User,
  fn: () => Promise<ContractTransactionResponse>,
) {
  await setInterestRate(contracts, governance, 100)
  await openTrove(contracts, {
    musdAmount: "50,000",
    ICR: "1000",
    sender: userA.wallet,
  })
  await updateInterestRateDataSnapshot(contracts, state, 100, "before")

  await setInterestRate(contracts, governance, 200)
  await openTrove(contracts, {
    musdAmount: "50,000",
    sender: userB.wallet,
  })
  await updateInterestRateDataSnapshot(contracts, state, 200, "before")

  await fn()
  await updateTroveSnapshot(contracts, userA, "after")
  await updateInterestRateDataSnapshot(contracts, state, 100, "after")
  await updateTroveSnapshot(contracts, userB, "after")
  await updateInterestRateDataSnapshot(contracts, state, 200, "after")

  // Check that 100 bps interest rate data is updated
  expect(
    state.troveManager.interestRateData[100].interest.after,
  ).to.be.greaterThan(state.troveManager.interestRateData[100].interest.before)
  expect(state.troveManager.interestRateData[100].interest.after).to.equal(
    userA.trove.interestOwed.after,
  )

  // Check that 200 bps interest rate data is unchanged
  expect(state.troveManager.interestRateData[200].interest.after).to.equal(
    state.troveManager.interestRateData[200].interest.before,
  )
  expect(state.troveManager.interestRateData[200].interest.after).to.equal(
    userB.trove.interestOwed.after,
  )
}
