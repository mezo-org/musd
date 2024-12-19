import { expect } from "chai"
import {
  Contracts,
  TestingAddresses,
  User,
  openTrove,
  setupTests,
  dropPriceAndLiquidate,
} from "../helpers"
import { to1e18 } from "../utils"
import { ZERO_ADDRESS } from "../../helpers/constants"

describe("Access Control: Liquity functions with the caller restricted to Liquity contract(s)", () => {
  let alice: User
  let bob: User
  let carol: User
  let deployer: User

  let addresses: TestingAddresses
  let contracts: Contracts

  beforeEach(async () => {
    ;({ alice, bob, carol, deployer, contracts, addresses } =
      await setupTests())

    await Promise.all(
      [alice, bob, carol].map((user) =>
        openTrove(contracts, {
          sender: user.wallet,
          ICR: "200",
          musdAmount: "20,000",
        }),
      ),
    )
  })

  describe("BorrowerOperations", () => {
    it("moveCollateralGainToTrove(): reverts when called by an account that is not StabilityPool", async () => {
      await expect(
        contracts.borrowerOperations
          .connect(alice.wallet)
          .moveCollateralGainToTrove(
            alice.address,
            to1e18("2"),
            alice.address,
            alice.address,
          ),
      ).to.be.revertedWith("BorrowerOps: Caller is not Stability Pool")
    })

    it("mintBootstrapLoanFromPCV(): reverts when called by an account that is not PCV", async () => {
      await expect(
        contracts.borrowerOperations
          .connect(alice.wallet)
          .mintBootstrapLoanFromPCV(to1e18("2")),
      ).to.be.revertedWith("BorrowerOperations: caller must be PCV")
    })

    it("burnDebtFromPCV(): reverts when called by an account that is not PCV", async () => {
      await expect(
        contracts.borrowerOperations
          .connect(alice.wallet)
          .burnDebtFromPCV(to1e18("2")),
      ).to.be.revertedWith("BorrowerOperations: caller must be PCV")
    })

    it("refinance(): reverts when called on a trove that is not active", async () => {
      await dropPriceAndLiquidate(contracts, deployer, carol)
      await expect(
        contracts.borrowerOperations.connect(carol.wallet).refinance(to1e18(1)),
      ).to.be.revertedWith("BorrowerOps: Trove does not exist or is closed")
    })

    it("setRefinancingFeePercentage(): reverts if called by anyone other than governance", async () => {
      await expect(
        contracts.borrowerOperations
          .connect(alice.wallet)
          .setRefinancingFeePercentage(1),
      ).to.be.revertedWith(
        "BorrowerOps: Only governance can call this function",
      )
    })
  })

  describe("InterestRateManager", () => {
    it("setAddresses(): can only be called once", async () => {
      await expect(
        contracts.interestRateManager.setAddresses(
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
        ),
      ).to.be.revertedWithCustomError(
        contracts.interestRateManager,
        "OwnableUnauthorizedAccount",
      )
    })

    it("proposeInterestRate(): reverts when called by an account that is not governance", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .proposeInterestRate(1000n),
      ).to.be.revertedWith(
        "InterestRateManager: Only governance can call this function",
      )
    })

    it("approveInterestRate(): reverts when called by account that is not governance", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .approveInterestRate(),
      ).to.be.revertedWith(
        "InterestRateManager: Only governance can call this function",
      )
    })

    it("setMaxInterestRate(): reverts when called by account that is not governance", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .setMaxInterestRate(1000n),
      ).to.be.revertedWith(
        "InterestRateManager: Only governance can call this function",
      )
    })

    it("addPrincipalToRate(): reverts when called by account that is not borrower operations or trove manager", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .addPrincipalToRate(1000n, to1e18(2300)),
      ).to.be.revertedWith(
        "InterestRateManager: Only BorrowerOperations or TroveManager may call this function.",
      )
    })

    it("updateTroveDebt(): reverts when called by account that is not trove manager", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .updateTroveDebt(to1e18(4300), to1e18(2300), 1000n),
      ).to.be.revertedWith(
        "InterestRateManager: Only TroveManager may call this function.",
      )
    })

    it("addInterestToRate(): reverts when called by account that is not borrower operations or trove manager", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .addInterestToRate(1000n, to1e18(4300)),
      ).to.be.revertedWith(
        "InterestRateManager: Only BorrowerOperations or TroveManager may call this function.",
      )
    })

    it("removePrincipalFromRate(): reverts when called by account that is not borrower operations or trove manager", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .removePrincipalFromRate(1000n, to1e18(4300)),
      ).to.be.revertedWith(
        "InterestRateManager: Only BorrowerOperations or TroveManager may call this function.",
      )
    })

    it("removeInterestFromRate(): reverts when called by account that is not borrower operations or trove manager", async () => {
      await expect(
        contracts.interestRateManager
          .connect(alice.wallet)
          .removeInterestFromRate(1000n, to1e18(4300)),
      ).to.be.revertedWith(
        "InterestRateManager: Only BorrowerOperations or TroveManager may call this function.",
      )
    })
  })

  describe("TroveManager", () => {
    it("applyPendingRewards(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .applyPendingRewards(alice.address),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("updateTroveRewardSnapshots(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .updateTroveRewardSnapshots(alice.address),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("removeStake(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager.connect(alice.wallet).removeStake(alice.address),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("updateStakeAndTotalStakes(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .updateStakeAndTotalStakes(alice.address),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("closeTrove(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager.connect(alice.wallet).closeTrove(alice.address),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("addTroveOwnerToArray(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .addTroveOwnerToArray(alice.address),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("setTroveStatus(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .setTroveStatus(alice.address, 1),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("increaseTroveColl(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .increaseTroveColl(alice.address, 100),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("decreaseTroveColl(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .decreaseTroveColl(alice.address, 100),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("increaseTroveDebt(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .increaseTroveDebt(alice.address, 100),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })

    it("decreaseTroveDebt(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.troveManager
          .connect(alice.wallet)
          .decreaseTroveDebt(alice.address, 100),
      ).to.be.revertedWith(
        "TroveManager: Caller is not the BorrowerOperations contract",
      )
    })
  })

  describe("ActivePool", () => {
    it("sendCollateral(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
      await expect(
        contracts.activePool
          .connect(alice.wallet)
          .sendCollateral(alice.address, 100),
      ).to.be.revertedWith(
        "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool",
      )
    })

    it("increaseDebt(): reverts when called by an account that is not BO nor TroveM", async () => {
      await expect(
        contracts.activePool.connect(alice.wallet).increaseDebt(100n, 0n),
      ).to.be.revertedWith(
        "ActivePool: Caller must be BorrowerOperations, TroveManager, or InterestRateManager",
      )
    })

    it("decreaseDebt(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
      await expect(
        contracts.activePool.connect(alice.wallet).decreaseDebt(100n, 0n),
      ).to.be.revertedWith(
        "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool",
      )
    })

    it("fallback(): reverts when called by an account that is not Borrower Operations nor Default Pool", async () => {
      await expect(
        deployer.wallet.sendTransaction({
          to: addresses.activePool,
          value: 100n,
        }),
      ).to.be.revertedWith(
        "ActivePool: Caller is neither BorrowerOperations nor Default Pool",
      )
    })
  })

  describe("GasPool", () => {
    it("sendMUSD(): reverts when called by an account that is not TroveManager", async () => {
      await expect(
        contracts.gasPool.connect(alice.wallet).sendMUSD(alice.address, 100),
      ).to.be.revertedWith("GasPool: Caller is not the TroveManager")
    })
  })

  describe("DefaultPool", () => {
    it("sendCollateralToActivePool(): reverts when called by an account that is not TroveManager", async () => {
      await expect(
        contracts.defaultPool
          .connect(alice.wallet)
          .sendCollateralToActivePool(100),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })

    it("increaseDebt(): reverts when called by an account that is not TroveManager", async () => {
      await expect(
        contracts.defaultPool.connect(alice.wallet).increaseDebt(100n, 0n),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })

    it("decreaseDebt(): reverts when called by an account that is not TroveManager", async () => {
      await expect(
        contracts.defaultPool.connect(alice.wallet).decreaseDebt(100n, 0n),
      ).to.be.revertedWith("DefaultPool: Caller is not the TroveManager")
    })

    it("fallback(): reverts when called by an account that is not the Active Pool", async () => {
      await expect(
        deployer.wallet.sendTransaction({
          to: addresses.defaultPool,
          value: 100n,
        }),
      ).to.be.revertedWith("DefaultPool: Caller is not the ActivePool")
    })
  })

  describe("StabilityPool", () => {
    it("offset(): reverts when called by an account that is not TroveManager", async () => {
      await expect(
        contracts.stabilityPool.connect(alice.wallet).offset(100, 10),
      ).to.be.revertedWith("StabilityPool: Caller is not TroveManager")
    })

    it("fallback(): reverts when called by an account that is not the Active Pool", async () => {
      await expect(
        deployer.wallet.sendTransaction({
          to: addresses.stabilityPool,
          value: 100n,
        }),
      ).to.be.revertedWith("StabilityPool: Caller is not ActivePool")
    })
  })

  describe("MUSD", () => {
    it("mint(): reverts when called by an account that is not BorrowerOperations", async () => {
      await expect(
        contracts.musd.connect(alice.wallet).mint(alice.address, 100),
      ).to.be.revertedWith("MUSD: Caller not allowed to mint")
    })

    it("burn(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
      await expect(
        contracts.musd.connect(alice.wallet).burn(alice.address, 100),
      ).to.be.revertedWith("MUSD: Caller not allowed to burn")
    })
  })

  describe("SortedTroves", () => {
    it("insert(): reverts when called by an account that is not BorrowerOps or TroveM", async () => {
      await expect(
        contracts.sortedTroves
          .connect(alice.wallet)
          .insert(
            alice.address,
            "150000000000000000000",
            alice.address,
            alice.address,
          ),
      ).to.be.revertedWith("SortedTroves: Caller is neither BO nor TroveM")
    })

    it("remove(): reverts when called by an account that is not TroveManager", async () => {
      await expect(
        contracts.sortedTroves.connect(alice.wallet).remove(bob.address),
      ).to.be.revertedWith("SortedTroves: Caller is not the TroveManager")
    })

    it("reInsert(): reverts when called by an account that is not BorrowerOps or TroveM", async () => {
      await expect(
        contracts.sortedTroves
          .connect(alice.wallet)
          .reInsert(
            alice.address,
            "150000000000000000000",
            alice.address,
            alice.address,
          ),
      ).to.be.revertedWith("SortedTroves: Caller is neither BO nor TroveM")
    })
  })

  describe("PCV", () => {
    async function payDebt() {
      await contracts.pcv.connect(deployer.wallet).initialize()
      const debtToPay = await contracts.pcv.debtToPay()
      await contracts.musd.unprotectedMint(addresses.pcv, debtToPay)
      await contracts.pcv.connect(deployer.wallet).payDebt(debtToPay)
    }

    it("withdrawMUSD(): reverts when caller is not owner, council or treasury", async () => {
      await payDebt()
      await expect(
        contracts.pcv.connect(alice.wallet).withdrawMUSD(alice.address, 1),
      ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
    })

    it("setFeeSplit(): reverts when caller is not owner, council or treasury", async () => {
      await expect(
        contracts.pcv.connect(alice.wallet).setFeeSplit(1),
      ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
    })

    it("setFeeRecipient(): reverts when caller is not owner, council or treasury", async () => {
      await expect(
        contracts.pcv.connect(alice.wallet).setFeeRecipient(alice.address),
      ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
    })

    it("withdrawCollateral(): reverts when caller is not owner, council or treasury", async () => {
      await payDebt()
      await expect(
        contracts.pcv
          .connect(alice.wallet)
          .withdrawCollateral(alice.address, 1),
      ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
    })

    it("payDebt(): reverts when caller is not owner, council or treasury", async () => {
      await expect(
        contracts.pcv.connect(alice.wallet).payDebt(1),
      ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
    })

    it("initialize(): reverts when caller is not owner, council or treasury", async () => {
      await expect(
        contracts.pcv.connect(alice.wallet).initialize(),
      ).to.be.revertedWith("PCV: caller must be owner or council or treasury")
    })

    it("addRecipientToWhitelist(): reverts when caller is not owner", async () => {
      await expect(
        contracts.pcv
          .connect(alice.wallet)
          .addRecipientToWhitelist(bob.address),
      )
        .to.be.revertedWithCustomError(
          contracts.pcv,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(alice.address)
    })

    it("addRecipientsToWhitelist(): reverts when caller is not owner", async () => {
      await expect(
        contracts.pcv
          .connect(alice.wallet)
          .addRecipientsToWhitelist([bob.address]),
      )
        .to.be.revertedWithCustomError(
          contracts.pcv,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(alice.address)
    })

    it("removeRecipientFromWhitelist(): reverts when caller is not owner", async () => {
      await expect(
        contracts.pcv
          .connect(alice.wallet)
          .removeRecipientFromWhitelist(alice.address),
      )
        .to.be.revertedWithCustomError(
          contracts.pcv,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(alice.address)
    })

    it("removeRecipientsFromWhitelist(): reverts when caller is not owner", async () => {
      await expect(
        contracts.pcv
          .connect(alice.wallet)
          .removeRecipientsFromWhitelist([alice.address]),
      )
        .to.be.revertedWithCustomError(
          contracts.pcv,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(alice.address)
    })

    it("startChangingRoles(): reverts when caller is not owner", async () => {
      await expect(
        contracts.pcv
          .connect(alice.wallet)
          .startChangingRoles(alice.address, alice.address),
      )
        .to.be.revertedWithCustomError(
          contracts.pcv,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(alice.address)
    })

    it("cancelChangingRoles(): reverts when caller is not owner", async () => {
      await expect(contracts.pcv.connect(alice.wallet).cancelChangingRoles())
        .to.be.revertedWithCustomError(
          contracts.pcv,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(alice.address)
    })

    it("finalizeChangingRoles(): reverts when caller is not owner", async () => {
      await expect(contracts.pcv.connect(alice.wallet).finalizeChangingRoles())
        .to.be.revertedWithCustomError(
          contracts.pcv,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(alice.address)
    })
  })
})
