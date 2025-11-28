import { ethers, upgrades } from "hardhat"

const describeFn =
  process.env.NODE_ENV === "upgrades-test" ? describe : describe.skip

describeFn("TroveManager - upgrade tests", () => {
  it("should be able to upgrade the current mainnet version", async () => {
    const TroveManager = await ethers.getContractFactory("TroveManager")
    await upgrades.validateUpgrade(
      "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
      TroveManager,
    )
  })
})
