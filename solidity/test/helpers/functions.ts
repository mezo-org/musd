import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { to1e18, ZERO_ADDRESS, GOVERNANCE_TIME_DELAY } from "../utils"
import { Contracts, OpenTroveParams } from "./interfaces"
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
  const compositeDebt =
    await contracts.borrowerOperations.getCompositeDebt(musdAmount)
  return compositeDebt + fee
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

  // amount of debt to take on
  const totalDebt = await getOpenTroveTotalDebt(contracts, musdAmount)

  // amount of assets required for the loan
  const price = await contracts.priceFeedTestnet.getPrice()
  const assetAmount = (ICR * totalDebt) / price

  // try {
  const tx = await contracts.borrowerOperations
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
