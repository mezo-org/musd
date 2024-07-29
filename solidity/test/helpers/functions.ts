/* eslint no-param-reassign: ["error", { "props": false }] */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { ContractTransactionResponse, ethers } from "ethers"
import { to1e18, ZERO_ADDRESS, GOVERNANCE_TIME_DELAY } from "../utils"
import {
  ContractsV1,
  OpenTroveParams,
  AddCollParams,
  User,
  ContractsV2,
} from "./interfaces"
import { fastForwardTime } from "./time"

// Contract specific helper functions
export async function removeMintlist(
  contracts: ContractsV1,
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
  contracts: ContractsV1,
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

export async function updateTroveSnapshot(
  contracts: ContractsV1,
  user: User,
  checkPoint: "before" | "after",
) {
  const [debt, collateral, stake, status] = await contracts.troveManager.Troves(
    user.address,
  )

  user.trove.debt[checkPoint] = debt
  user.trove.collateral[checkPoint] = collateral
  user.trove.stake[checkPoint] = stake
  user.trove.status[checkPoint] = status
}

export async function updatePendingSnapshot(
  contracts: ContractsV1,
  user: User,
  checkPoint: "before" | "after",
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
  contracts: ContractsV1,
  user: User,
  checkPoint: "before" | "after",
) {
  const [collateral, debt] = await contracts.troveManager.rewardSnapshots(
    user.address,
  )

  user.rewardSnapshot.collateral[checkPoint] = collateral
  user.rewardSnapshot.debt[checkPoint] = debt
}

export async function getTroveEntireColl(
  contracts: ContractsV1,
  address: HardhatEthersSigner,
) {
  return (await contracts.troveManager.getEntireDebtAndColl(address))[1]
}

export async function getTroveEntireDebt(
  contracts: ContractsV1,
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

export async function addColl(contracts: ContractsV1, inputs: AddCollParams) {
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

export async function openTrove(
  contracts: ContractsV1,
  inputs: OpenTroveParams,
) {
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

export async function openTroveV2(
  contracts: ContractsV2,
  inputs: OpenTroveParams,
) {
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

export async function getTCR(contracts: ContractsV1) {
  const price = await contracts.priceFeed.fetchPrice()
  return contracts.troveManager.getTCR(price)
}
