import { expect } from "chai"
import { deployments, ethers, getNamedAccounts, helpers } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import {
  connectContracts,
  deployment,
  fastForwardTime,
  fixtureBorrowerOperations,
  openTrove,
} from "../../helpers"
import { to1e18, ZERO_ADDRESS } from "../../utils"

async function getContract(name: string) {
  const deployer = await ethers.provider.getSigner()
  return ethers.getContractAt(
    name,
    (await deployments.get(name)).address,
    deployer,
  )
}

async function deployAndGetContract(name: string) {
  const { deployer } = await getNamedAccounts()
  await deployments.deploy(name, {
    contract: name,
    args: [],
    from: deployer,
    log: true,
    waitConfirmations: 1,
  })
  return getContract(name)
}

async function deployTroveManager() {
  await deployments.fixture([
    "ActivePool",
    "TroveManager",
    "BorrowerOperations",
    "PriceFeedTestnet",
  ])
  const troveManager = await getContract("TroveManager")
  const borrowerOperations = await getContract("BorrowerOperations")
  const priceFeed = await getContract("PriceFeedTestnet")
  const activePool = await getContract("ActivePool")
  await borrowerOperations.setPriceFeed(await priceFeed.getAddress())
  return { activePool, borrowerOperations, troveManager }
}

describe.only("TroveManager in Normal Mode", () => {
  it("should return the current interest rate", async () => {
    const { troveManager } = await loadFixture(deployTroveManager)
    expect(await troveManager.getInterestRate()).to.equal(0)
  })
  it("should calculate the interest owed for a trove", async () => {
    const testSetup = await loadFixture(fixtureBorrowerOperations)
    await connectContracts(testSetup.contracts, testSetup.users)
    const { contracts } = testSetup
    const { deployer } = await helpers.signers.getNamedSigners()
    await contracts.troveManager.connect(deployer).proposeInterestRate(1)

    // Simulate 7 days passing
    const timeToIncrease = 7 * 24 * 60 * 60 // 7 days in seconds
    await fastForwardTime(timeToIncrease)
    await contracts.troveManager.connect(deployer).approveInterestRate()

    const [alice] = await helpers.signers.getUnnamedSigners()
    await openTrove(contracts, {
      musdAmount: "10000",
      sender: alice,
    })

    // fast forward 30 days
    const thirtyDays = 30 * 24 * 60 * 60 // 7 days in seconds
    await fastForwardTime(thirtyDays)

    const interest = await contracts.troveManager.calculateInterestOwed(alice)
    expect(interest).to.be.equal(5605)

    const debt = await contracts.troveManager.getTroveDebt(alice)
    expect(debt).to.be.equal((10250n + interest) * 10n ** 18n)
  })
})
