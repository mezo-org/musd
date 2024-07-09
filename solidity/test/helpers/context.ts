import { deployments } from "hardhat"
import { getDeployedContract } from "./contract"

import type {
  BorrowerOperations,
  MUSD,
  StabilityPool,
  TroveManager,
} from "../../typechain/contracts"

import type { MUSDTester } from "../../typechain/contracts/tests"

// eslint-disable-next-line import/prefer-default-export
export async function deployment() {
  await deployments.fixture()

  const musd: MUSD = await getDeployedContract("MUSD")
  const musdTester: MUSDTester = await getDeployedContract("MUSDTester")
  const troveManager: TroveManager = await getDeployedContract("TroveManager")
  const borrowerOperations: BorrowerOperations =
    await getDeployedContract("BorrowerOperations")
  const stabilityPool: StabilityPool =
    await getDeployedContract("StabilityPool")
  const newTroveManager: TroveManager = await getDeployedContract("Dummy")
  const newBorrowerOperations: BorrowerOperations =
    await getDeployedContract("Dummy")
  const newStabilityPool: StabilityPool = await getDeployedContract("Dummy")

  return {
    musd,
    musdTester,
    troveManager,
    borrowerOperations,
    stabilityPool,
    newTroveManager,
    newBorrowerOperations,
    newStabilityPool,
  }
}
