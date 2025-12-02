import { ethers, upgrades } from "hardhat"

const describeFn =
  process.env.NODE_ENV === "upgrades-test" ? describe : describe.skip

describeFn("BorrowerOperations - upgrade tests", () => {
  it("should be able to upgrade the current mainnet version", async () => {
    const BorrowerOperations =
      await ethers.getContractFactory("BorrowerOperations")
    await upgrades.validateUpgrade(
      "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
      BorrowerOperations,
    )
  })
})
