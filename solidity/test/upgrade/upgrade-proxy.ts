import { expect } from "chai"
import { helpers } from "hardhat"

import {
  Contracts,
  User,
  openTrove,
  setupTests,
  updateTroveSnapshot,
} from "../helpers"
import { to1e18 } from "../utils"

describe("Proxy Upgrades", () => {
  let contracts: Contracts
  let carol: User
  let whale: User

  beforeEach(async () => {
    ;({ contracts, carol, whale } = await setupTests())
  })

  const updatePriceFeed = async () =>
    helpers.upgrades.upgradeProxy("PriceFeed", "PriceFeedUpgradeTester")

  it("do not change the underlying address", async () => {
    const oldPrice = await contracts.priceFeed.fetchPrice()
    const oldAddress = await contracts.priceFeed.getAddress()
    expect(oldPrice).to.equal(to1e18("50,000"))

    await updatePriceFeed()

    const newPrice = await contracts.priceFeed.fetchPrice()
    const newAddress = await contracts.priceFeed.getAddress()
    expect(newPrice).to.equal(to1e18("45,000"))
    expect(newAddress).to.equal(oldAddress)
  })

  it("automatically interoperate with connected contracts", async () => {
    await openTrove(contracts, {
      musdAmount: "300,000",
      ICR: "200",
      sender: whale.wallet,
    })

    await openTrove(contracts, {
      musdAmount: "2,000",
      ICR: "120",
      sender: carol.wallet,
    })

    // Updating the price feed in place reduces the BTC price from $50k to $45k,
    // lowering carol's ICR to a liquidatable number.
    await updatePriceFeed()

    await contracts.troveManager.connect(whale.wallet).liquidate(carol.wallet)

    await updateTroveSnapshot(contracts, carol, "after")

    expect(carol.trove.debt.after).to.equal(0n)
  })
})
