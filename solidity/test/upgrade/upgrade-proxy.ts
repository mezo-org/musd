import { expect } from "chai"
import { ethers, helpers } from "hardhat"

import {
  Contracts,
  User,
  setupTests,
  getLatestBlockTimestamp,
} from "../helpers"
import { to1e18 } from "../utils"
import { ZERO_ADDRESS } from "../../helpers/constants"
import {
  ActivePoolV2,
  BorrowerOperationsSignaturesV2,
  BorrowerOperationsV2,
  CollSurplusPoolV2,
  DefaultPoolV2,
  GasPoolV2,
  HintHelpersV2,
  InterestRateManagerV2,
  PCVv2,
  PriceFeedV2,
  SortedTrovesV2,
  StabilityPoolV2,
  TroveManagerV2,
} from "../../typechain"

describe("Proxy Upgrades", () => {
  let contracts: Contracts

  let carol: User
  let deployer: User

  beforeEach(async () => {
    ;({ contracts, carol, deployer } = await setupTests())
  })

  const upgradeProxy = async <T>(
    currentContractName: string,
    newContractName: string,
  ) => {
    const [newContract] = await helpers.upgrades.upgradeProxy(
      currentContractName,
      newContractName,
      {
        proxyOpts: {
          call: {
            fn: "initializeV2",
          },
        },
      },
    )

    return newContract as unknown as T
  }

  it("upgrades InterestRateManager contract correctly", async () => {
    const interestRate = await contracts.interestRateManager.interestRate()

    const upgraded = await upgradeProxy<InterestRateManagerV2>(
      "InterestRateManager",
      "InterestRateManagerV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.interestRateManager.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.interestRate()).to.equal(interestRate)

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(881)
  })

  it("upgrades BorrowerOperations contract correctly", async () => {
    const upgraded = await upgradeProxy<BorrowerOperationsV2>(
      "BorrowerOperations",
      "BorrowerOperationsV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.stabilityPoolAddress()).to.equal(
      await contracts.stabilityPool.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(886)
  })

  it("upgrades TroveManager contract correctly", async () => {
    const upgraded = await upgradeProxy<TroveManagerV2>(
      "TroveManagerTester",
      "TroveManagerV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.troveManager.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.stabilityPool()).to.equal(
      await contracts.stabilityPool.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(1000)
  })

  it("upgrades StabilityPool contract correctly", async () => {
    const upgraded = await upgradeProxy<StabilityPoolV2>(
      "StabilityPool",
      "StabilityPoolV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.stabilityPool.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.borrowerOperations()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(701)
  })

  it("upgrades CollSurplusPool contract correctly", async () => {
    const upgraded = await upgradeProxy<CollSurplusPoolV2>(
      "CollSurplusPool",
      "CollSurplusPoolV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.collSurplusPool.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.borrowerOperationsAddress()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(102)
  })

  it("upgrades ActivePool contract correctly", async () => {
    const upgraded = await upgradeProxy<ActivePoolV2>(
      "ActivePool",
      "ActivePoolV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.activePool.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.borrowerOperationsAddress()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(610)
  })

  it("upgrades DefaultPool contract correctly", async () => {
    const upgraded = await upgradeProxy<DefaultPoolV2>(
      "DefaultPool",
      "DefaultPoolV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.defaultPool.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.activePoolAddress()).to.equal(
      await contracts.activePool.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(213)
  })

  it("upgrades PCV contract correctly", async () => {
    const upgraded = await upgradeProxy<PCVv2>("PCV", "PCVv2")

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.pcv.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.owner()).to.equal(deployer.address)

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(61)
  })

  it("upgrades SortedTroves contract correctly", async () => {
    const size = await contracts.sortedTroves.getSize()

    const upgraded = await upgradeProxy<SortedTrovesV2>(
      "SortedTroves",
      "SortedTrovesV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.sortedTroves.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.getSize()).to.equal(size)

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(701)
  })

  it("upgrades GasPool contract correctly", async () => {
    const token = await contracts.gasPool.musdToken()

    const upgraded = await upgradeProxy<GasPoolV2>("GasPool", "GasPoolV2")

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.gasPool.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.musdToken()).to.equal(token)

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(145)
  })

  it("upgrades PriceFeed contract correctly", async () => {
    const upgraded = await upgradeProxy<PriceFeedV2>("PriceFeed", "PriceFeedV2")

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.priceFeed.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.owner()).to.equal(deployer.address)

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(398)
  })

  it("upgrades HintHelpers contract correctly", async () => {
    const upgraded = await upgradeProxy<HintHelpersV2>(
      "HintHelpers",
      "HintHelpersV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.hintHelpers.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.troveManager()).to.equal(
      await contracts.troveManager.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(255)
  })

  const prepareSignature = async (borrower: User, version: string) => {
    const types = {
      OpenTrove: [
        { name: "assetAmount", type: "uint256" },
        { name: "debtAmount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }

    const borrowerOpSignatures = contracts.borrowerOperationsSignatures
    const borrowerOpSignaturesAddress = await borrowerOpSignatures.getAddress()

    const debtAmount = to1e18(2000)
    const assetAmount = to1e18(10)
    const upperHint = ZERO_ADDRESS
    const lowerHint = ZERO_ADDRESS

    const recipient = borrower
    const { chainId } = await ethers.provider.getNetwork()
    const nonce = await borrowerOpSignatures.getNonce(borrower.address)
    const deadline = BigInt(await getLatestBlockTimestamp()) + 3600n // 1 hour from now

    const domain = {
      name: "BorrowerOperationsSignatures",
      version,
      chainId,
      verifyingContract: borrowerOpSignaturesAddress,
    }

    const value = {
      assetAmount,
      debtAmount,
      borrower: borrower.address,
      recipient: recipient.address,
      nonce,
      deadline,
    }

    const signature = await carol.wallet.signTypedData(domain, types, value)

    return {
      debtAmount,
      upperHint,
      lowerHint,
      borrower: borrower.address,
      recipient: recipient.address,
      signature,
      deadline,
      assetAmount,
    }
  }

  it("upgrades BorrowerOperationsSignatures correctly", async () => {
    const upgraded = await upgradeProxy<BorrowerOperationsSignaturesV2>(
      "BorrowerOperationsSignatures",
      "BorrowerOperationsSignaturesV2",
    )

    // sanity check - address is the same
    expect(await upgraded.getAddress()).to.equal(
      await contracts.borrowerOperationsSignatures.getAddress(),
    )

    // state preserved and previous functionality works
    expect(await upgraded.borrowerOperations()).to.equal(
      await contracts.borrowerOperations.getAddress(),
    )

    // new functionality works
    await upgraded.newFunction()
    expect(await upgraded.newField()).to.equal(723)

    // opening troves with signatures for version 1 is no longer possible
    const oldSig = await prepareSignature(carol, "1")
    await expect(
      upgraded
        .connect(carol.wallet)
        .openTroveWithSignature(
          oldSig.debtAmount,
          oldSig.upperHint,
          oldSig.lowerHint,
          oldSig.borrower,
          oldSig.recipient,
          oldSig.signature,
          oldSig.deadline,
          { value: oldSig.assetAmount },
        ),
    ).to.be.revertedWith("BorrowerOperationsSignatures: Invalid signature")

    // opening troves with signatures for version 2 is possible
    const newSig = await prepareSignature(carol, "2")
    const tx = await upgraded
      .connect(carol.wallet)
      .openTroveWithSignature(
        newSig.debtAmount,
        newSig.upperHint,
        newSig.lowerHint,
        newSig.borrower,
        newSig.recipient,
        newSig.signature,
        newSig.deadline,
        { value: newSig.assetAmount },
      )

    await expect(tx).to.emit(contracts.borrowerOperations, "TroveCreated")
  })
})
