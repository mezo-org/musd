import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
// eslint-disable-next-line import/no-unresolved
import { time } from "@nomicfoundation/hardhat-network-helpers"
import { MockERC20, MockContract, PCVERC20 } from "../../typechain"

describe("PCVERC20", () => {
  let token: MockERC20
  let pcv: PCVERC20

  // Mock contracts
  let mockBorrowerOperations: MockContract
  let mockMUSD: MockERC20
  let mockStabilityPool: MockContract

  // Addresses
  let borrowerOperationsAddress: string
  let musdAddress: string
  let stabilityPoolAddress: string

  // Signers
  let deployer: HardhatEthersSigner
  let alice: HardhatEthersSigner
  let bob: HardhatEthersSigner
  let council: HardhatEthersSigner
  let treasury: HardhatEthersSigner
  let feeRecipient: HardhatEthersSigner
  let collateralRecipient: HardhatEthersSigner

  const GOVERNANCE_DELAY = 7 * 24 * 60 * 60 // 7 days in seconds

  beforeEach(async () => {
    ;[
      deployer,
      alice,
      bob,
      council,
      treasury,
      feeRecipient,
      collateralRecipient,
    ] = await ethers.getSigners()

    // Deploy MockERC20 for collateral
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    token = await MockERC20Factory.deploy()

    // Deploy mock MUSD
    mockMUSD = await MockERC20Factory.deploy()

    // Deploy mock contracts for checkContract validation
    const MockContractFactory = await ethers.getContractFactory("MockContract")
    mockBorrowerOperations = await MockContractFactory.deploy()
    mockStabilityPool = await MockContractFactory.deploy()

    // Store addresses
    borrowerOperationsAddress = await mockBorrowerOperations.getAddress()
    musdAddress = await mockMUSD.getAddress()
    stabilityPoolAddress = await mockStabilityPool.getAddress()

    // Deploy PCVERC20 as upgradeable proxy
    const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
    pcv = (await upgrades.deployProxy(
      PCVERC20Factory,
      [await token.getAddress(), GOVERNANCE_DELAY],
      { initializer: "initialize" },
    )) as unknown as PCVERC20

    // Set addresses
    await pcv.setAddresses(
      borrowerOperationsAddress,
      musdAddress,
      stabilityPoolAddress,
    )
  })

  describe("initialize", () => {
    it("should set the collateral token", async () => {
      expect(await pcv.collateralToken()).to.equal(await token.getAddress())
    })

    it("should set the governance time delay", async () => {
      expect(await pcv.governanceTimeDelay()).to.equal(GOVERNANCE_DELAY)
    })

    it("should start with zero collateral balance", async () => {
      expect(await pcv.getCollateralBalance()).to.equal(0)
    })

    it("should start with zero debt to pay", async () => {
      expect(await pcv.debtToPay()).to.equal(0)
    })

    it("should revert if initialized twice", async () => {
      await expect(
        pcv.initialize(await token.getAddress(), GOVERNANCE_DELAY),
      ).to.be.revertedWithCustomError(pcv, "InvalidInitialization")
    })

    it("should revert if collateral token is zero address", async () => {
      const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
      await expect(
        upgrades.deployProxy(
          PCVERC20Factory,
          [ethers.ZeroAddress, GOVERNANCE_DELAY],
          { initializer: "initialize" },
        ),
      ).to.be.revertedWith("Invalid collateral token")
    })

    it("should revert if governance delay is too long", async () => {
      const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
      const tooLongDelay = 31 * 7 * 24 * 60 * 60 // 31 weeks
      await expect(
        upgrades.deployProxy(
          PCVERC20Factory,
          [await token.getAddress(), tooLongDelay],
          { initializer: "initialize" },
        ),
      ).to.be.revertedWith("Governance delay is too big")
    })
  })

  describe("setAddresses", () => {
    it("should emit address changed events", async () => {
      const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
      const newPcv = (await upgrades.deployProxy(
        PCVERC20Factory,
        [await token.getAddress(), GOVERNANCE_DELAY],
        { initializer: "initialize" },
      )) as unknown as PCVERC20

      await expect(
        newPcv.setAddresses(
          borrowerOperationsAddress,
          musdAddress,
          stabilityPoolAddress,
        ),
      )
        .to.emit(newPcv, "BorrowerOperationsAddressSet")
        .withArgs(borrowerOperationsAddress)
        .and.to.emit(newPcv, "MUSDTokenAddressSet")
        .withArgs(musdAddress)
        .and.to.emit(newPcv, "StabilityPoolAddressSet")
        .withArgs(stabilityPoolAddress)
    })

    it("should revert if called twice", async () => {
      await expect(
        pcv.setAddresses(
          borrowerOperationsAddress,
          musdAddress,
          stabilityPoolAddress,
        ),
      ).to.be.revertedWith("PCVERC20: contracts already set")
    })

    it("should revert if called by non-owner", async () => {
      const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
      const newPcv = (await upgrades.deployProxy(
        PCVERC20Factory,
        [await token.getAddress(), GOVERNANCE_DELAY],
        { initializer: "initialize" },
      )) as unknown as PCVERC20

      await expect(
        newPcv
          .connect(alice)
          .setAddresses(
            borrowerOperationsAddress,
            musdAddress,
            stabilityPoolAddress,
          ),
      ).to.be.revertedWithCustomError(newPcv, "OwnableUnauthorizedAccount")
    })

    it("should revert if address is not a contract", async () => {
      const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
      const newPcv = (await upgrades.deployProxy(
        PCVERC20Factory,
        [await token.getAddress(), GOVERNANCE_DELAY],
        { initializer: "initialize" },
      )) as unknown as PCVERC20

      await expect(
        newPcv.setAddresses(
          alice.address, // EOA, not a contract
          musdAddress,
          stabilityPoolAddress,
        ),
      ).to.be.revertedWith("Account code size cannot be zero")
    })
  })

  describe("receiveCollateral", () => {
    const amount = ethers.parseEther("100")

    it("should pull tokens from caller", async () => {
      await token.mint(alice.address, amount)
      await token.connect(alice).approve(await pcv.getAddress(), amount)

      await pcv.connect(alice).receiveCollateral(amount)

      expect(await token.balanceOf(await pcv.getAddress())).to.equal(amount)
    })

    it("should update collateral balance", async () => {
      await token.mint(alice.address, amount)
      await token.connect(alice).approve(await pcv.getAddress(), amount)

      await pcv.connect(alice).receiveCollateral(amount)

      expect(await pcv.getCollateralBalance()).to.equal(amount)
    })

    it("should emit CollateralReceived event", async () => {
      await token.mint(alice.address, amount)
      await token.connect(alice).approve(await pcv.getAddress(), amount)

      await expect(pcv.connect(alice).receiveCollateral(amount))
        .to.emit(pcv, "CollateralReceived")
        .withArgs(alice.address, amount)
    })

    it("should allow multiple deposits", async () => {
      const amount1 = ethers.parseEther("50")
      const amount2 = ethers.parseEther("30")

      await token.mint(alice.address, amount1)
      await token.connect(alice).approve(await pcv.getAddress(), amount1)
      await pcv.connect(alice).receiveCollateral(amount1)

      await token.mint(bob.address, amount2)
      await token.connect(bob).approve(await pcv.getAddress(), amount2)
      await pcv.connect(bob).receiveCollateral(amount2)

      expect(await pcv.getCollateralBalance()).to.equal(amount1 + amount2)
    })

    it("should handle zero amount gracefully", async () => {
      await pcv.connect(alice).receiveCollateral(0)
      expect(await pcv.getCollateralBalance()).to.equal(0)
    })
  })

  describe("distributeCollateral", () => {
    const amount = ethers.parseEther("100")

    beforeEach(async () => {
      // Receive some collateral first
      await token.mint(alice.address, amount)
      await token.connect(alice).approve(await pcv.getAddress(), amount)
      await pcv.connect(alice).receiveCollateral(amount)

      // Set up roles first (skip delay since no roles set initially)
      await pcv.startChangingRoles(council.address, treasury.address)
      await pcv.finalizeChangingRoles()

      // Set collateral recipient
      await pcv.setCollateralRecipient(collateralRecipient.address)
    })

    it("should transfer collateral to recipient", async () => {
      await pcv.distributeCollateral()

      expect(await token.balanceOf(collateralRecipient.address)).to.equal(
        amount,
      )
    })

    it("should reset collateral balance to zero", async () => {
      await pcv.distributeCollateral()

      expect(await pcv.getCollateralBalance()).to.equal(0)
    })

    it("should emit PCVDistributionCollateral event", async () => {
      await expect(pcv.distributeCollateral())
        .to.emit(pcv, "PCVDistributionCollateral")
        .withArgs(collateralRecipient.address, amount)
    })

    it("should revert if collateral recipient not set", async () => {
      const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
      const newPcv = (await upgrades.deployProxy(
        PCVERC20Factory,
        [await token.getAddress(), GOVERNANCE_DELAY],
        { initializer: "initialize" },
      )) as unknown as PCVERC20

      await newPcv.setAddresses(
        borrowerOperationsAddress,
        musdAddress,
        stabilityPoolAddress,
      )

      // Receive some collateral
      await token.mint(alice.address, amount)
      await token.connect(alice).approve(await newPcv.getAddress(), amount)
      await newPcv.connect(alice).receiveCollateral(amount)

      await expect(newPcv.distributeCollateral()).to.be.revertedWith(
        "PCVERC20: Collateral recipient not set",
      )
    })

    it("should do nothing if no collateral", async () => {
      // Distribute first
      await pcv.distributeCollateral()

      // Try to distribute again - should not revert
      await pcv.distributeCollateral()

      expect(await pcv.getCollateralBalance()).to.equal(0)
    })
  })

  describe("setFeeRecipient", () => {
    beforeEach(async () => {
      // Set up roles
      await pcv.startChangingRoles(council.address, treasury.address)
      await pcv.finalizeChangingRoles()
    })

    it("should set fee recipient when called by owner", async () => {
      await pcv.setFeeRecipient(feeRecipient.address)
      expect(await pcv.feeRecipient()).to.equal(feeRecipient.address)
    })

    it("should emit FeeRecipientSet event", async () => {
      await expect(pcv.setFeeRecipient(feeRecipient.address))
        .to.emit(pcv, "FeeRecipientSet")
        .withArgs(feeRecipient.address)
    })

    it("should allow council to set fee recipient", async () => {
      await pcv.connect(council).setFeeRecipient(feeRecipient.address)
      expect(await pcv.feeRecipient()).to.equal(feeRecipient.address)
    })

    it("should allow treasury to set fee recipient", async () => {
      await pcv.connect(treasury).setFeeRecipient(feeRecipient.address)
      expect(await pcv.feeRecipient()).to.equal(feeRecipient.address)
    })

    it("should revert if called by unauthorized address", async () => {
      await expect(
        pcv.connect(alice).setFeeRecipient(feeRecipient.address),
      ).to.be.revertedWith(
        "PCVERC20: caller must be owner or council or treasury",
      )
    })

    it("should revert if recipient is zero address", async () => {
      await expect(pcv.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWith(
        "PCVERC20: Recipient cannot be the zero address.",
      )
    })
  })

  describe("setCollateralRecipient", () => {
    beforeEach(async () => {
      // Set up roles
      await pcv.startChangingRoles(council.address, treasury.address)
      await pcv.finalizeChangingRoles()
    })

    it("should set collateral recipient when called by owner", async () => {
      await pcv.setCollateralRecipient(collateralRecipient.address)
      expect(await pcv.collateralRecipient()).to.equal(
        collateralRecipient.address,
      )
    })

    it("should emit CollateralRecipientSet event", async () => {
      await expect(pcv.setCollateralRecipient(collateralRecipient.address))
        .to.emit(pcv, "CollateralRecipientSet")
        .withArgs(collateralRecipient.address)
    })

    it("should revert if recipient is zero address", async () => {
      await expect(
        pcv.setCollateralRecipient(ethers.ZeroAddress),
      ).to.be.revertedWith(
        "PCVERC20: Collateral recipient cannot be the zero address.",
      )
    })
  })

  describe("setFeeSplit", () => {
    beforeEach(async () => {
      // Set up roles
      await pcv.startChangingRoles(council.address, treasury.address)
      await pcv.finalizeChangingRoles()

      // Must set fee recipient first
      await pcv.setFeeRecipient(feeRecipient.address)
    })

    it("should set fee split percentage", async () => {
      await pcv.setFeeSplit(50)
      expect(await pcv.feeSplitPercentage()).to.equal(50)
    })

    it("should emit FeeSplitSet event", async () => {
      await expect(pcv.setFeeSplit(75)).to.emit(pcv, "FeeSplitSet").withArgs(75)
    })

    it("should allow 0% fee split", async () => {
      await pcv.setFeeSplit(0)
      expect(await pcv.feeSplitPercentage()).to.equal(0)
    })

    it("should allow 100% fee split", async () => {
      await pcv.setFeeSplit(100)
      expect(await pcv.feeSplitPercentage()).to.equal(100)
    })

    it("should revert if fee split exceeds 100", async () => {
      await expect(pcv.setFeeSplit(101)).to.be.revertedWith(
        "PCVERC20: Fee split must be at most 100",
      )
    })

    it("should revert if fee recipient not set", async () => {
      const PCVERC20Factory = await ethers.getContractFactory("PCVERC20")
      const newPcv = (await upgrades.deployProxy(
        PCVERC20Factory,
        [await token.getAddress(), GOVERNANCE_DELAY],
        { initializer: "initialize" },
      )) as unknown as PCVERC20

      await newPcv.setAddresses(
        borrowerOperationsAddress,
        musdAddress,
        stabilityPoolAddress,
      )

      await expect(newPcv.setFeeSplit(50)).to.be.revertedWith(
        "PCVERC20 must set fee recipient before setFeeSplit",
      )
    })
  })

  describe("role management", () => {
    describe("startChangingRoles", () => {
      it("should initiate role change", async () => {
        await pcv.startChangingRoles(council.address, treasury.address)

        expect(await pcv.pendingCouncilAddress()).to.equal(council.address)
        expect(await pcv.pendingTreasuryAddress()).to.equal(treasury.address)
      })

      it("should skip delay if no roles set initially", async () => {
        await pcv.startChangingRoles(council.address, treasury.address)

        // Should be able to finalize immediately
        await pcv.finalizeChangingRoles()

        expect(await pcv.council()).to.equal(council.address)
        expect(await pcv.treasury()).to.equal(treasury.address)
      })

      it("should require delay for subsequent changes", async () => {
        // First change (no delay)
        await pcv.startChangingRoles(council.address, treasury.address)
        await pcv.finalizeChangingRoles()

        // Second change (requires delay)
        await pcv.startChangingRoles(alice.address, bob.address)

        await expect(pcv.finalizeChangingRoles()).to.be.revertedWith(
          "PCVERC20: Governance delay has not elapsed",
        )
      })

      it("should revert if roles are the same", async () => {
        await pcv.startChangingRoles(council.address, treasury.address)
        await pcv.finalizeChangingRoles()

        await expect(
          pcv.startChangingRoles(council.address, treasury.address),
        ).to.be.revertedWith("PCVERC20: these roles already set")
      })

      it("should revert if called by non-owner", async () => {
        await expect(
          pcv
            .connect(alice)
            .startChangingRoles(council.address, treasury.address),
        ).to.be.revertedWithCustomError(pcv, "OwnableUnauthorizedAccount")
      })
    })

    describe("cancelChangingRoles", () => {
      beforeEach(async () => {
        await pcv.startChangingRoles(council.address, treasury.address)
      })

      it("should cancel pending role change", async () => {
        await pcv.cancelChangingRoles()

        expect(await pcv.changingRolesInitiated()).to.equal(0)
        expect(await pcv.pendingCouncilAddress()).to.equal(ethers.ZeroAddress)
        expect(await pcv.pendingTreasuryAddress()).to.equal(ethers.ZeroAddress)
      })

      it("should revert if no change initiated", async () => {
        await pcv.cancelChangingRoles()

        await expect(pcv.cancelChangingRoles()).to.be.revertedWith(
          "PCVERC20: Change not initiated",
        )
      })
    })

    describe("finalizeChangingRoles", () => {
      it("should finalize role change after delay", async () => {
        // First set initial roles
        await pcv.startChangingRoles(council.address, treasury.address)
        await pcv.finalizeChangingRoles()

        // Now test with delay
        await pcv.startChangingRoles(alice.address, bob.address)

        // Fast forward time
        await time.increase(GOVERNANCE_DELAY)

        await pcv.finalizeChangingRoles()

        expect(await pcv.council()).to.equal(alice.address)
        expect(await pcv.treasury()).to.equal(bob.address)
      })

      it("should emit RolesSet event", async () => {
        await pcv.startChangingRoles(council.address, treasury.address)

        await expect(pcv.finalizeChangingRoles())
          .to.emit(pcv, "RolesSet")
          .withArgs(council.address, treasury.address)
      })

      it("should revert if no change initiated", async () => {
        await expect(pcv.finalizeChangingRoles()).to.be.revertedWith(
          "PCVERC20: Change not initiated",
        )
      })
    })
  })

  describe("whitelist management", () => {
    describe("addRecipientToWhitelist", () => {
      it("should add recipient to whitelist", async () => {
        await pcv.addRecipientToWhitelist(alice.address)
        expect(await pcv.recipientsWhitelist(alice.address)).to.equal(true)
      })

      it("should emit RecipientAdded event", async () => {
        await expect(pcv.addRecipientToWhitelist(alice.address))
          .to.emit(pcv, "RecipientAdded")
          .withArgs(alice.address)
      })

      it("should revert if already whitelisted", async () => {
        await pcv.addRecipientToWhitelist(alice.address)
        await expect(
          pcv.addRecipientToWhitelist(alice.address),
        ).to.be.revertedWith(
          "PCVERC20: Recipient has already been added to whitelist",
        )
      })

      it("should revert if called by non-owner", async () => {
        await expect(
          pcv.connect(alice).addRecipientToWhitelist(bob.address),
        ).to.be.revertedWithCustomError(pcv, "OwnableUnauthorizedAccount")
      })
    })

    describe("removeRecipientFromWhitelist", () => {
      beforeEach(async () => {
        await pcv.addRecipientToWhitelist(alice.address)
      })

      it("should remove recipient from whitelist", async () => {
        await pcv.removeRecipientFromWhitelist(alice.address)
        expect(await pcv.recipientsWhitelist(alice.address)).to.equal(false)
      })

      it("should emit RecipientRemoved event", async () => {
        await expect(pcv.removeRecipientFromWhitelist(alice.address))
          .to.emit(pcv, "RecipientRemoved")
          .withArgs(alice.address)
      })

      it("should revert if not whitelisted", async () => {
        await expect(
          pcv.removeRecipientFromWhitelist(bob.address),
        ).to.be.revertedWith("PCVERC20: Recipient is not in whitelist")
      })
    })
  })

  describe("ownership", () => {
    it("should use two-step ownership transfer", async () => {
      await pcv.transferOwnership(alice.address)

      // Owner should still be deployer
      expect(await pcv.owner()).to.equal(deployer.address)

      // Alice accepts ownership
      await pcv.connect(alice).acceptOwnership()

      expect(await pcv.owner()).to.equal(alice.address)
    })
  })
})
