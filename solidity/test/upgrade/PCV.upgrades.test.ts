import { ethers, upgrades } from "hardhat"

const describeFn =
  process.env.NODE_ENV === "upgrades-test" ? describe : describe.skip

describeFn("PCV - upgrade tests", () => {
  it("should be able to upgrade the current mainnet version", async () => {
    const PCV = await ethers.getContractFactory("PCV")
    await upgrades.validateUpgrade(
      "0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993",
      PCV,
    )
  })
})