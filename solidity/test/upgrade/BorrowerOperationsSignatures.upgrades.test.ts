import { ethers, upgrades } from "hardhat"

const describeFn =
  process.env.NODE_ENV === "upgrades-test" ? describe : describe.skip

describeFn("BorrowerOperations - upgrade tests", () => {
  it("should be able to upgrade the current mainnet version", async () => {
    const BorrowerOperationsSignatures = await ethers.getContractFactory(
      "BorrowerOperationsSignatures",
    )
    await upgrades.validateUpgrade(
      "0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a",
      BorrowerOperationsSignatures,
    )
  })
})
