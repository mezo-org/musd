/* eslint no-param-reassign: ["error", { "props": false }] */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { ContractTransactionResponse } from "ethers"
import { ethers, helpers } from "hardhat"
import { to1e18, ZERO_ADDRESS, GOVERNANCE_TIME_DELAY } from "../utils"
import {
  Contracts,
  OpenTroveParams,
  AddCollParams,
  User,
  TestingAddresses,
  ContractsState,
} from "./interfaces"
import { fastForwardTime } from "./time"

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
 * given the requested MUSD amomunt in openTrove, returns the total debt
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

export async function updateTroveSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  const [debt, collateral, stake, status] = await contracts.troveManager.Troves(
    user.address,
  )

  const price = await contracts.priceFeed.fetchPrice()
  const icr = await contracts.troveManager.getCurrentICR(user.address, price)

  user.trove.debt[checkPoint] = debt
  user.trove.collateral[checkPoint] = collateral
  user.trove.stake[checkPoint] = stake
  user.trove.status[checkPoint] = status
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

export async function updateMUSDUserSnapshot(
  contracts: Contracts,
  user: User,
  checkPoint: CheckPoint,
) {
  user.musd[checkPoint] = await contracts.musd.balanceOf(user.wallet)
}

export async function updateTroveManagerSnapshot(
  contracts: Contracts,
  state: ContractsState,
  checkPoint: CheckPoint,
) {
  state.troveManager.TCR[checkPoint] = await getTCR(contracts)
  state.troveManager.stakes[checkPoint] =
    await contracts.troveManager.totalStakes()
  state.troveManager.troves[checkPoint] =
    await contracts.troveManager.getTroveOwnersCount()
}

export async function getTroveEntireColl(
  contracts: Contracts,
  address: HardhatEthersSigner,
) {
  return (await contracts.troveManager.getEntireDebtAndColl(address))[1]
}

export async function getTroveEntireDebt(
  contracts: Contracts,
  address: HardhatEthersSigner,
) {
  return (await contracts.troveManager.getEntireDebtAndColl(address))[0]
}

export async function getEventArgByName(
  tx: ContractTransactionResponse,
  abi: Array<string>,
  eventName: string,
  argIndex: number,
) {
  const txReceipt = await tx.wait()
  const iface = new ethers.Interface(abi)

  if (txReceipt) {
    // eslint-disable-next-line no-restricted-syntax
    for (const log of txReceipt.logs) {
      try {
        const parsedLog = iface.parseLog(log)
        if (parsedLog && parsedLog.name === eventName) {
          return parsedLog.args[argIndex]
        }
      } catch (error) {
        // continue if the log does not match the event
      }
    }
  }
  throw new Error(
    `The transaction logs do not contain event ${eventName} and arg ${argIndex}`,
  )
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

  const tx = await contracts.borrowerOperations
    .connect(inputs.sender)
    .addColl(amount, params.lowerHint, params.upperHint, {
      value: amount, // The amount of chain base asset to send
    })

  return {
    tx,
  }
}

// Withdraw MUSD from a trove to make ICR equal to the target ICR
export async function adjustTroveToICR(
  contracts: Contracts,
  from: HardhatEthersSigner,
  targetICR: bigint,
) {
  const { debt, coll } = await contracts.troveManager.getEntireDebtAndColl(from)
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
  if (params.ICR === undefined) params.ICR = "150"
  const ICR = to1e18(params.ICR) / 100n // 1e18 = 100%

  const musdAmount =
    typeof params.musdAmount === "bigint"
      ? params.musdAmount
      : to1e18(params.musdAmount)

  const price = await contracts.priceFeed.fetchPrice()

  // amount of debt to take on
  const totalDebt = await getOpenTroveTotalDebt(contracts, musdAmount)

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
  }
}

export async function createLiquidationEvent(
  contracts: Contracts,
): Promise<void> {
  const priceBefore = await contracts.priceFeed.fetchPrice()
  const defaulter = (await helpers.signers.getUnnamedSigners())[8]
  await openTrove(contracts, {
    musdAmount: "2,000", // slightly over the minimum of $1800
    ICR: "120", // 120%
    sender: defaulter,
  })

  // Drop price to 90% of prior. This makes the defaulter's ICR equal to 108%
  // which is below the MCR of 110%
  await contracts.mockAggregator.setPrice((priceBefore * 9n) / 10n)

  // Liquidate Frank
  await contracts.troveManager.liquidate(defaulter)

  // Reset the price
  await contracts.mockAggregator.setPrice(priceBefore)
}

export function applyLiquidationFee(collateralAmount: bigint) {
  const liquidationFee = to1e18(99.5) / 100n // 0.5% liquidation fee
  return (collateralAmount * liquidationFee) / to1e18(1)
}

export async function provideToSP(
  contracts: Contracts,
  user: User,
  amount: bigint,
) {
  const stabilityPoolAddress = await contracts.stabilityPool.getAddress()
  await contracts.musd
    .connect(user.wallet)
    .approve(stabilityPoolAddress, amount)
  await contracts.stabilityPool.connect(user.wallet).provideToSP(amount)
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
  const target = targetICR ?? (await contracts.troveManager.MCR()) - 1n

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
  statusToCheck: bigint = 3n,
  isInSortedList: boolean = false,
) {
  const status = await contracts.troveManager.getTroveStatus(user.wallet)
  const inSortedList = await contracts.sortedTroves.contains(user.wallet)
  return status === statusToCheck && isInSortedList === inSortedList
}
