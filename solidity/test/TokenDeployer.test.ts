import { ethers, helpers } from "hardhat"
import { expect } from "chai"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { MUSD, TokenDeployer } from "../typechain"

describe("TokenDeployer", () => {
  let deployer: TokenDeployer

  let troveManagerAddress: string
  let stabilityPoolAddress: string
  let borrowerOperationsAddress: string
  let interestRateManagerAddress: string
  const governanceDelay = 86400

  const deployerAddress = "0x123694886DBf5Ac94DDA07135349534536D14cAf"
  const governanceAddress = "0x98D8899c3030741925BE630C710A98B57F397C7a"

  let thirdPartySigner: HardhatEthersSigner
  let deployerSigner: HardhatEthersSigner

  before(async () => {
    deployer = await (await ethers.getContractFactory("TokenDeployer")).deploy()

    troveManagerAddress = await ethers
      .getContractFactory("TroveManager")
      .then((factory) => factory.deploy())
      .then((contract) => contract.getAddress())

    stabilityPoolAddress = await ethers
      .getContractFactory("StabilityPool")
      .then((factory) => factory.deploy())
      .then((contract) => contract.getAddress())

    borrowerOperationsAddress = await ethers
      .getContractFactory("BorrowerOperations")
      .then((factory) => factory.deploy())
      .then((contract) => contract.getAddress())

    interestRateManagerAddress = await ethers
      .getContractFactory("InterestRateManager")
      .then((factory) => factory.deploy())
      .then((contract) => contract.getAddress())
    ;[thirdPartySigner] = await helpers.signers.getUnnamedSigners()
    deployerSigner = await helpers.account.impersonateAccount(deployerAddress, {
      from: thirdPartySigner,
      value: 10n,
    })
  })

  describe("deployToken", () => {
    context("when called by a third party", () => {
      it("should revert", async () => {
        await expect(
          deployer.deployToken(
            troveManagerAddress,
            stabilityPoolAddress,
            borrowerOperationsAddress,
            interestRateManagerAddress,
            governanceDelay,
          ),
        ).to.be.revertedWithCustomError(deployer, "NotDeployer")
      })
    })

    context("when called by the governance", () => {
      let token: MUSD

      before(async () => {
        await deployer
          .connect(deployerSigner)
          .deployToken(
            troveManagerAddress,
            stabilityPoolAddress,
            borrowerOperationsAddress,
            interestRateManagerAddress,
            governanceDelay,
          )

        token = await ethers.getContractAt("MUSD", await deployer.token())
      })

      it("should initialize the token", async () => {
        expect(await token.burnList(troveManagerAddress)).to.eq(true)
        expect(await token.burnList(stabilityPoolAddress)).to.eq(true)
        expect(await token.burnList(borrowerOperationsAddress)).to.eq(true)
        expect(await token.mintList(borrowerOperationsAddress)).to.eq(true)
        expect(await token.mintList(interestRateManagerAddress)).to.eq(true)
        expect(await token.governanceTimeDelay()).to.eq(governanceDelay)
      })

      it("should pass the token ownership to governance", async () => {
        expect(await token.owner()).to.eq(governanceAddress)
      })
    })
  })
})
