// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IInterestRateManager.sol";
import "./interfaces/IPCV.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./token/IMUSD.sol";
import "./BorrowerOperationsState.sol";

contract BorrowerOperations is
    CheckContract,
    IBorrowerOperations,
    LiquityBase,
    OwnableUpgradeable,
    SendCollateral
{
    /* --- Variable container structs  ---

    Used to hold, return and assign variables inside a function, in order to avoid the error:
    "CompilerError: Stack too deep". */

    struct LocalVariables_adjustTrove {
        uint256 price;
        uint256 collChange;
        uint256 netDebtChange;
        bool isCollIncrease;
        uint256 debt;
        uint256 coll;
        uint256 oldICR;
        uint256 newICR;
        uint256 newTCR;
        uint256 fee;
        uint256 newColl;
        uint256 newPrincipal;
        uint256 newInterest;
        uint256 stake;
        uint256 interestOwed;
        uint256 principalAdjustment;
        uint256 interestAdjustment;
        bool isRecoveryMode;
        uint256 newNICR;
    }

    struct LocalVariables_openTrove {
        uint256 price;
        uint256 fee;
        uint256 netDebt;
        uint256 compositeDebt;
        uint256 ICR;
        uint256 NICR;
        uint256 stake;
        uint256 arrayIndex;
    }

    struct ContractsCache {
        ITroveManager troveManager;
        IActivePool activePool;
        IMUSD musd;
        IInterestRateManager interestRateManager;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove
    }

    string public constant name = "BorrowerOperations";

    BorrowerOperationsState.Storage internal self;

    uint256 public constant MIN_TOTAL_DEBT = 250e18;

    modifier onlyGovernance() {
        require(
            msg.sender == self.pcv.council() ||
                msg.sender == self.pcv.treasury(),
            "BorrowerOps: Only governance can call this function"
        );
        _;
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        self.refinancingFeePercentage = 20;
        self.minNetDebt = 1800e18;
        self.musdGasCompensation = 200e18;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // Calls on PCV behalf
    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external {
        require(
            msg.sender == self.pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        self.musd.mint(self.pcvAddress, _musdToMint);
    }

    function burnDebtFromPCV(uint256 _musdToBurn) external virtual {
        require(
            msg.sender == self.pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        self.musd.burn(self.pcvAddress, _musdToBurn);
    }

    // --- Borrower Trove Operations ---
    function openTrove(
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        this.restrictedOpenTrove{value: msg.value}(
            msg.sender,
            _maxFeePercentage,
            _debtAmount,
            _upperHint,
            _lowerHint
        );
    }

    // Send collateral to a trove
    function addColl(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        this.restrictedAddColl{value: msg.value}(
            msg.sender,
            _assetAmount,
            _upperHint,
            _lowerHint
        );
    }

    // Send collateral to a trove. Called by only the Stability Pool.
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _requireCallerIsStabilityPool();
        _assetAmount = msg.value;
        this.restrictedAdjustTrove{value: msg.value}(
            _borrower,
            0,
            0,
            false,
            _assetAmount,
            _upperHint,
            _lowerHint,
            0,
            false
        );
    }

    // Withdraw collateral from a trove
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        this.restrictedWithdrawColl(
            msg.sender,
            _amount,
            _upperHint,
            _lowerHint
        );
    }

    // Withdraw mUSD tokens from a trove: mint new mUSD tokens to the owner, and increase the trove's principal accordingly
    function withdrawMUSD(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        this.restrictedAdjustTrove(
            msg.sender,
            0,
            _amount,
            true,
            0,
            _upperHint,
            _lowerHint,
            _maxFeePercentage,
            false
        );
    }

    // Repay mUSD tokens to a Trove: Burn the repaid mUSD tokens, and reduce the trove's debt accordingly
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        this.restrictedAdjustTrove(
            msg.sender,
            0,
            _amount,
            false,
            0,
            _upperHint,
            _lowerHint,
            0,
            false
        );
    }

    function closeTrove() external override {
        this.restrictedCloseTrove(msg.sender);
    }

    function refinance(uint256 _maxFeePercentage) external override {
        ITroveManager troveManagerCached = self.troveManager;
        IInterestRateManager interestRateManagerCached = self
            .interestRateManager;
        _requireTroveisActive(troveManagerCached, msg.sender);
        troveManagerCached.updateSystemAndTroveInterest(msg.sender);

        uint16 oldRate = troveManagerCached.getTroveInterestRate(msg.sender);
        uint256 oldInterest = troveManagerCached.getTroveInterestOwed(
            msg.sender
        );
        uint256 oldDebt = troveManagerCached.getTroveDebt(msg.sender);
        uint256 amount = (self.refinancingFeePercentage * oldDebt) / 100;
        uint256 fee = _triggerBorrowingFee(
            troveManagerCached,
            self.musd,
            amount,
            _maxFeePercentage
        );
        // slither-disable-next-line unused-return
        troveManagerCached.increaseTroveDebt(msg.sender, fee);

        uint256 oldPrincipal = troveManagerCached.getTrovePrincipal(msg.sender);

        interestRateManagerCached.removeInterestFromRate(oldRate, oldInterest);
        interestRateManagerCached.removePrincipalFromRate(
            oldRate,
            oldPrincipal
        );
        uint16 newRate = interestRateManagerCached.interestRate();
        interestRateManagerCached.addInterestToRate(newRate, oldInterest);
        interestRateManagerCached.addPrincipalToRate(newRate, oldPrincipal);

        troveManagerCached.setTroveInterestRate(
            msg.sender,
            interestRateManagerCached.interestRate()
        );

        uint256 maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            troveManagerCached.getTroveColl(msg.sender),
            priceFeed.fetchPrice()
        );
        troveManagerCached.setTroveMaxBorrowingCapacity(
            msg.sender,
            maxBorrowingCapacity
        );

        // slither-disable-next-line reentrancy-events
        emit RefinancingFeePaid(msg.sender, fee);
    }

    /*
     * adjustTrove(): Alongside a debt change, this function can perform either a collateral top-up or a collateral withdrawal.
     *
     * It therefore expects either a positive msg.value, or a positive _collWithdrawal argument.
     *
     * If both are positive, it will revert.
     */
    function adjustTrove(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        this.restrictedAdjustTrove(
            msg.sender,
            _collWithdrawal,
            _debtChange,
            _isDebtIncrease,
            msg.value,
            _upperHint,
            _lowerHint,
            _maxFeePercentage,
            false
        );
    }
    // Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
    function claimCollateral() external override {
        // send collateral from CollSurplus Pool to owner
        self.collSurplusPool.claimColl(msg.sender);
    }

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsSignaturesAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
        address _interestRateManagerAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        // This makes impossible to open a trove with zero withdrawn mUSD
        assert(self.minNetDebt > 0);

        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsSignaturesAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        activePool = IActivePool(_activePoolAddress);
        self
            .borrowerOperationsSignaturesAddress = _borrowerOperationsSignaturesAddress;
        self.collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        self.gasPoolAddress = _gasPoolAddress;
        self.interestRateManager = IInterestRateManager(
            _interestRateManagerAddress
        );
        self.musd = IMUSD(_musdTokenAddress);
        self.pcv = IPCV(_pcvAddress);
        self.pcvAddress = _pcvAddress;
        priceFeed = IPriceFeed(_priceFeedAddress);
        self.sortedTroves = ISortedTroves(_sortedTrovesAddress);
        self.stabilityPoolAddress = _stabilityPoolAddress;
        self.troveManager = ITroveManager(_troveManagerAddress);
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsSignaturesAddressChanged(
            _borrowerOperationsSignaturesAddress
        );
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PCVAddressChanged(_pcvAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    function setRefinancingFeePercentage(
        uint8 _refinanceFeePercentage
    ) external override onlyGovernance {
        require(
            _refinanceFeePercentage <= 100,
            "BorrowerOps: Refinancing fee percentage must be <= 100"
        );
        self.refinancingFeePercentage = _refinanceFeePercentage;
    }

    function proposeMinNetDebt(uint256 _minNetDebt) external onlyGovernance {
        // Making users lock up at least $250 reduces potential dust attacks
        require(
            _minNetDebt + self.musdGasCompensation >= MIN_TOTAL_DEBT,
            "Minimum Net Debt plus Gas Compensation must be at least $250."
        );
        self.proposedMinNetDebt = _minNetDebt;
        // solhint-disable-next-line not-rely-on-time
        self.proposedMinNetDebtTime = block.timestamp;
        emit MinNetDebtProposed(
            self.proposedMinNetDebt,
            self.proposedMinNetDebtTime
        );
    }

    function approveMinNetDebt() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= self.proposedMinNetDebtTime + 7 days,
            "Must wait at least 7 days before approving a change to Minimum Net Debt"
        );
        require(
            self.proposedMinNetDebt + self.musdGasCompensation >=
                MIN_TOTAL_DEBT,
            "Minimum Net Debt plus Gas Compensation must be at least $250."
        );
        self.minNetDebt = self.proposedMinNetDebt;
        emit MinNetDebtChanged(self.minNetDebt);
    }

    function proposeMusdGasCompensation(
        uint256 _musdGasCompensation
    ) external onlyGovernance {
        // Making users lock up at least $250 reduces potential dust attacks
        require(
            self.minNetDebt + _musdGasCompensation >= MIN_TOTAL_DEBT,
            "Minimum Net Debt plus Gas Compensation must be at least $250."
        );
        self.proposedMusdGasCompensation = _musdGasCompensation;
        // solhint-disable-next-line not-rely-on-time
        self.proposedMusdGasCompensationTime = block.timestamp;
        emit MusdGasCompensationProposed(
            self.proposedMusdGasCompensation,
            self.proposedMusdGasCompensationTime
        );
    }

    function approveMusdGasCompensation() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= self.proposedMusdGasCompensationTime + 7 days,
            "Must wait at least 7 days before approving a change to Gas Compensation"
        );
        require(
            self.minNetDebt + self.proposedMusdGasCompensation >=
                MIN_TOTAL_DEBT,
            "Minimum Net Debt plus Gas Compensation must be at least $250."
        );
        self.musdGasCompensation = self.proposedMusdGasCompensation;
        emit MusdGasCompensationChanged(self.musdGasCompensation);
    }

    function minNetDebt() external view returns (uint256) {
        return self.minNetDebt;
    }

    function proposedMinNetDebt() external view returns (uint256) {
        return self.proposedMinNetDebt;
    }

    function proposedMusdGasCompensation() external view returns (uint256) {
        return self.proposedMusdGasCompensation;
    }

    function getMusdGasCompensation() external view returns (uint256) {
        return self.musdGasCompensation;
    }

    function stabilityPoolAddress() external view returns (address) {
        return self.stabilityPoolAddress;
    }


    function getNonce(address user) public view returns (uint256) {
        return self.nonces[user];
    }

    // Returns the composite debt (drawn debt + gas compensation) of a trove,
    // for the purpose of ICR calculation
    function getCompositeDebt(uint256 _debt) public view returns (uint) {
        return _debt + self.musdGasCompensation;
    }

    function getNetDebt(uint256 _debt) public view returns (uint) {
        return _debt - self.musdGasCompensation;
    }

    function restrictedAddColl(
        address _borrower,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) public payable {
        _requireCallerIsBorrowerOperationsOrSignatures();
        _assetAmount = msg.value;
        this.restrictedAdjustTrove{value: msg.value}(
            _borrower,
            0,
            0,
            false,
            _assetAmount,
            _upperHint,
            _lowerHint,
            0,
            _borrower != msg.sender
        );
    }

    function restrictedWithdrawColl(
        address _borrower,
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) public {
        _requireCallerIsBorrowerOperationsOrSignatures();
        this.restrictedAdjustTrove(
            _borrower,
            _amount,
            0,
            false,
            0,
            _upperHint,
            _lowerHint,
            0,
            _borrower != msg.sender
        );
    }

    function restrictedOpenTrove(
        address _borrower,
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) public payable {
        _requireCallerIsBorrowerOperationsOrSignatures();
        ContractsCache memory contractsCache = ContractsCache(
            self.troveManager,
            activePool,
            self.musd,
            self.interestRateManager
        );
        // slither-disable-next-line uninitialized-local
        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        _requireValidMaxFeePercentage(_maxFeePercentage, isRecoveryMode);
        _requireTroveisNotActive(contractsCache.troveManager, _borrower);

        vars.fee;
        vars.netDebt = _debtAmount;

        if (!isRecoveryMode) {
            vars.fee = _triggerBorrowingFee(
                contractsCache.troveManager,
                contractsCache.musd,
                _debtAmount,
                _maxFeePercentage
            );
            vars.netDebt += vars.fee;
        }

        _requireAtLeastMinNetDebt(vars.netDebt);

        // ICR is based on the composite debt, i.e. the requested amount + borrowing fee + gas comp.
        vars.compositeDebt = getCompositeDebt(vars.netDebt);
        assert(vars.compositeDebt > 0);

        // if BTC overwrite the asset value
        vars.ICR = LiquityMath._computeCR(
            msg.value,
            vars.compositeDebt,
            vars.price
        );
        vars.NICR = LiquityMath._computeNominalCR(
            msg.value,
            vars.compositeDebt
        );

        if (isRecoveryMode) {
            _requireICRisAboveCCR(vars.ICR);
        } else {
            _requireICRisAboveMCR(vars.ICR);
            uint256 newTCR = _getNewTCRFromTroveChange(
                msg.value,
                true,
                vars.compositeDebt,
                true,
                vars.price
            ); // bools: coll increase, debt increase
            _requireNewTCRisAboveCCR(newTCR);
        }

        contractsCache.troveManager.setTroveInterestRate(
            _borrower,
            contractsCache.interestRateManager.interestRate()
        );

        // Set the trove struct's properties
        contractsCache.troveManager.setTroveStatus(
            _borrower,
            ITroveManager.Status.active
        );
        // slither-disable-next-line unused-return
        contractsCache.troveManager.increaseTroveColl(_borrower, msg.value);
        // slither-disable-next-line unused-return
        contractsCache.troveManager.increaseTroveDebt(
            _borrower,
            vars.compositeDebt
        );

        // solhint-disable not-rely-on-time
        contractsCache.troveManager.setTroveLastInterestUpdateTime(
            _borrower,
            block.timestamp
        );
        // solhint-enable not-rely-on-time

        // Set trove's max borrowing capacity to the amount that would put it at 110% ICR
        uint256 maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            msg.value,
            vars.price
        );
        contractsCache.troveManager.setTroveMaxBorrowingCapacity(
            _borrower,
            maxBorrowingCapacity
        );

        contractsCache.troveManager.updateTroveRewardSnapshots(_borrower);
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            _borrower
        );

        self.sortedTroves.insert(_borrower, vars.NICR, _upperHint, _lowerHint);
        vars.arrayIndex = contractsCache.troveManager.addTroveOwnerToArray(
            _borrower
        );

        /*
         * Move the collateral to the Active Pool, and mint the amount to the borrower
         * If the user has insuffient tokens to do the transfer to the Active Pool an error will cause the transaction to revert.
         */
        _activePoolAddColl(contractsCache.activePool, msg.value);
        _withdrawMUSD(
            contractsCache.activePool,
            contractsCache.musd,
            _borrower,
            _debtAmount,
            vars.netDebt
        );
        // Move the mUSD gas compensation to the Gas Pool
        _withdrawMUSD(
            contractsCache.activePool,
            contractsCache.musd,
            self.gasPoolAddress,
            self.musdGasCompensation,
            self.musdGasCompensation
        );

        // slither-disable-start reentrancy-events
        emit TroveCreated(_borrower, vars.arrayIndex);

        emit TroveUpdated(
            _borrower,
            vars.compositeDebt,
            0,
            msg.value,
            vars.stake,
            uint8(BorrowerOperation.openTrove)
        );
        emit BorrowingFeePaid(_borrower, vars.fee);
        // slither-disable-end reentrancy-events
    }

    function restrictedCloseTrove(address _borrower) public {
        _requireCallerIsBorrowerOperationsOrSignatures();
        ITroveManager troveManagerCached = self.troveManager;
        IActivePool activePoolCached = activePool;
        IMUSD musdTokenCached = self.musd;
        bool canMint = musdTokenCached.mintList(address(this));

        troveManagerCached.updateSystemAndTroveInterest(_borrower);

        _requireTroveisActive(troveManagerCached, _borrower);
        uint256 price = priceFeed.fetchPrice();
        if (canMint) {
            _requireNotInRecoveryMode(price);
        }

        troveManagerCached.applyPendingRewards(_borrower);

        uint256 coll = troveManagerCached.getTroveColl(_borrower);
        uint256 debt = troveManagerCached.getTroveDebt(_borrower);
        uint256 interestOwed = troveManagerCached.getTroveInterestOwed(
            _borrower
        );

        _requireSufficientMUSDBalance(
            _borrower,
            debt - self.musdGasCompensation
        );
        if (canMint) {
            uint256 newTCR = _getNewTCRFromTroveChange(
                coll,
                false,
                debt,
                false,
                price
            );
            _requireNewTCRisAboveCCR(newTCR);
        }

        troveManagerCached.removeStake(_borrower);
        troveManagerCached.closeTrove(_borrower);

        // slither-disable-next-line reentrancy-events
        emit TroveUpdated(
            _borrower,
            0,
            0,
            0,
            0,
            uint8(BorrowerOperation.closeTrove)
        );

        // Decrease the active pool debt by the principal (subtracting interestOwed from the total debt)
        activePoolCached.decreaseDebt(
            debt - self.musdGasCompensation - interestOwed,
            interestOwed
        );

        // Burn the repaid mUSD from the user's balance
        musdTokenCached.burn(_borrower, debt - self.musdGasCompensation);

        // Burn the gas compensation from the gas pool
        _repayMUSD(
            activePoolCached,
            musdTokenCached,
            self.gasPoolAddress,
            self.musdGasCompensation,
            0
        );

        // Send the collateral back to the user
        activePoolCached.sendCollateral(_borrower, coll);
    }

    function restrictedAdjustTrove(
        address _borrower,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        uint256 _maxFeePercentage,
        bool _isSignatureCall
    ) public payable {
        _requireCallerIsBorrowerOperationsOrSignatures();
        ContractsCache memory contractsCache = ContractsCache(
            self.troveManager,
            activePool,
            self.musd,
            self.interestRateManager
        );

        contractsCache.troveManager.updateSystemAndTroveInterest(_borrower);

        // slither-disable-next-line uninitialized-local
        LocalVariables_adjustTrove memory vars;

        // Snapshot interest and principal before repayment so we can correctly adjust the active pool
        vars.interestOwed = contractsCache.troveManager.getTroveInterestOwed(
            _borrower
        );

        (vars.principalAdjustment, vars.interestAdjustment) = contractsCache
            .interestRateManager
            .calculateDebtAdjustment(vars.interestOwed, _mUSDChange);

        vars.price = priceFeed.fetchPrice();
        vars.isRecoveryMode = _checkRecoveryMode(vars.price);

        if (_isDebtIncrease) {
            _requireValidMaxFeePercentage(
                _maxFeePercentage,
                vars.isRecoveryMode
            );
            _requireNonZeroDebtChange(_mUSDChange);
        }
        _requireSingularCollChange(_collWithdrawal, _assetAmount);
        _requireNonZeroAdjustment(_collWithdrawal, _mUSDChange, _assetAmount);
        _requireTroveisActive(contractsCache.troveManager, _borrower);

        /*
         * If this is not a signature call, confirm the operation is either a borrower adjusting their own trove,
         * or a pure collateral transfer from the Stability Pool to a trove
         */
        assert(
            msg.sender == _borrower ||
                (msg.sender == self.stabilityPoolAddress &&
                    _assetAmount > 0 &&
                    _mUSDChange == 0) ||
                msg.sender == address(this) ||
                _isSignatureCall
        );

        contractsCache.troveManager.applyPendingRewards(_borrower);

        // Get the collChange based on whether or not collateral was sent in the transaction
        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            _assetAmount,
            _collWithdrawal
        );

        vars.netDebtChange = _mUSDChange;

        // If the adjustment incorporates a principal increase and system is in Normal Mode, then trigger a borrowing fee
        if (_isDebtIncrease && !vars.isRecoveryMode) {
            vars.fee = _triggerBorrowingFee(
                contractsCache.troveManager,
                contractsCache.musd,
                _mUSDChange,
                _maxFeePercentage
            );
            vars.netDebtChange += vars.fee; // The raw debt change includes the fee
        }

        vars.debt = contractsCache.troveManager.getTroveDebt(_borrower);
        vars.coll = contractsCache.troveManager.getTroveColl(_borrower);

        // Get the trove's old ICR before the adjustment, and what its new ICR will be after the adjustment
        vars.oldICR = LiquityMath._computeCR(vars.coll, vars.debt, vars.price);
        vars.newICR = _getNewICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease,
            vars.price
        );
        assert(_collWithdrawal <= vars.coll);

        // Check the adjustment satisfies all conditions for the current system mode
        _requireValidAdjustmentInCurrentMode(
            vars.isRecoveryMode,
            _collWithdrawal,
            _isDebtIncrease,
            vars
        );

        // When the adjustment is a debt repayment, check it's a valid amount and that the caller has enough mUSD
        if (!_isDebtIncrease && _mUSDChange > 0) {
            _requireAtLeastMinNetDebt(
                getNetDebt(vars.debt) - vars.netDebtChange
            );
            _requireValidMUSDRepayment(vars.debt, vars.netDebtChange);
            _requireSufficientMUSDBalance(_borrower, vars.netDebtChange);
        }

        (
            vars.newColl,
            vars.newPrincipal,
            vars.newInterest
        ) = _updateTroveFromAdjustment(
            contractsCache.troveManager,
            _borrower,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            _borrower
        );

        // Re-insert trove in to the sorted list
        vars.newNICR = _getNewNominalICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        self.sortedTroves.reInsert(
            _borrower,
            vars.newNICR,
            _upperHint,
            _lowerHint
        );

        // slither-disable-next-line reentrancy-events
        emit TroveUpdated(
            _borrower,
            vars.newPrincipal,
            vars.newInterest,
            vars.newColl,
            vars.stake,
            uint8(BorrowerOperation.adjustTrove)
        );
        // slither-disable-next-line reentrancy-events
        emit BorrowingFeePaid(_borrower, vars.fee);

        // Use the unmodified _mUSDChange here, as we don't send the fee to the user
        _moveTokensAndCollateralfromAdjustment(
            contractsCache.activePool,
            contractsCache.musd,
            _borrower,
            vars.collChange,
            vars.isCollIncrease,
            _isDebtIncrease ? _mUSDChange : vars.principalAdjustment,
            vars.interestAdjustment,
            _isDebtIncrease,
            vars.netDebtChange
        );
    }

    // Issue the specified amount of mUSD to _account and increases the total active debt (_netDebtIncrease potentially includes a MUSDFee)
    function _withdrawMUSD(
        IActivePool _activePool,
        IMUSD _musd,
        address _account,
        uint256 _debtAmount,
        uint256 _netDebtIncrease
    ) internal {
        _activePool.increaseDebt(_netDebtIncrease, 0);
        _musd.mint(_account, _debtAmount);
    }

    // Burn the specified amount of MUSD from _account and decreases the total active debt
    function _repayMUSD(
        IActivePool _activePool,
        IMUSD _musd,
        address _account,
        uint256 _principal,
        uint256 _interest
    ) internal {
        _activePool.decreaseDebt(_principal, _interest);
        _musd.burn(_account, _principal + _interest);
    }

    function _moveTokensAndCollateralfromAdjustment(
        IActivePool _activePool,
        IMUSD _musd,
        address _borrower,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _principalChange,
        uint256 _interestChange,
        bool _isDebtIncrease,
        uint256 _netDebtChange
    ) internal {
        if (_isDebtIncrease) {
            _withdrawMUSD(
                _activePool,
                _musd,
                _borrower,
                _principalChange,
                _netDebtChange
            );
        } else {
            _repayMUSD(
                _activePool,
                _musd,
                _borrower,
                _principalChange,
                _interestChange
            );
        }

        if (_isCollIncrease) {
            _activePoolAddColl(_activePool, _collChange);
        } else {
            _activePool.sendCollateral(_borrower, _collChange);
        }
    }

    // Send collateral to Active Pool and increase its recorded collateral balance
    function _activePoolAddColl(
        IActivePool _activePool,
        uint256 _amount
    ) internal {
        _sendCollateral(address(_activePool), _amount);
    }

    // Update trove's coll and debt based on whether they increase or decrease
    function _updateTroveFromAdjustment(
        ITroveManager _troveManager,
        address _borrower,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    )
        internal
        returns (uint256 newColl, uint256 newPrincipal, uint256 newInterest)
    {
        newColl = (_isCollIncrease)
            ? _troveManager.increaseTroveColl(_borrower, _collChange)
            : _troveManager.decreaseTroveColl(_borrower, _collChange);

        if (_isDebtIncrease) {
            newPrincipal = _troveManager.increaseTroveDebt(
                _borrower,
                _debtChange
            );
        } else {
            (newPrincipal, newInterest) = _troveManager.decreaseTroveDebt(
                _borrower,
                _debtChange
            );
        }
    }

    // --- Helper functions ---

    function _triggerBorrowingFee(
        ITroveManager _troveManager,
        IMUSD _musd,
        uint256 _amount,
        uint256 _maxFeePercentage
    ) internal returns (uint) {
        uint256 fee = _troveManager.getBorrowingFee(_amount);
        _requireUserAcceptsFee(fee, _amount, _maxFeePercentage);

        // Send fee to PCV contract
        _musd.mint(self.pcvAddress, fee);
        return fee;
    }

    function _requireCallerIsBorrowerOperationsOrSignatures() internal view {
        require(
            msg.sender == self.borrowerOperationsSignaturesAddress ||
                msg.sender == address(this),
            "BorrowerOps: Caller is not BorrowerOperations or BorrowerOperationsSignatures"
        );
    }

    function _requireNotInRecoveryMode(uint256 _price) internal view {
        require(
            !_checkRecoveryMode(_price),
            "BorrowerOps: Operation not permitted during Recovery Mode"
        );
    }

    function _requireTroveisNotActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        ITroveManager.Status status = _troveManager.getTroveStatus(_borrower);
        require(
            status != ITroveManager.Status.active,
            "BorrowerOps: Trove is active"
        );
    }

    function _getNewTCRFromTroveChange(
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _price
    ) internal view returns (uint) {
        uint256 totalColl = getEntireSystemColl();
        uint256 totalDebt = getEntireSystemDebt();

        totalColl = _isCollIncrease
            ? totalColl + _collChange
            : totalColl - _collChange;
        totalDebt = _isDebtIncrease
            ? totalDebt + _debtChange
            : totalDebt - _debtChange;

        uint256 newTCR = LiquityMath._computeCR(totalColl, totalDebt, _price);
        return newTCR;
    }

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == self.stabilityPoolAddress,
            "BorrowerOps: Caller is not Stability Pool"
        );
    }

    function _requireTroveisActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        ITroveManager.Status status = _troveManager.getTroveStatus(_borrower);

        require(
            status == ITroveManager.Status.active,
            "BorrowerOps: Trove does not exist or is closed"
        );
    }

    /*
     * In Normal Mode, ensure:
     *
     * - The new ICR is above MCR
     * - The adjustment won't pull the TCR below CCR
     */
    function _requireValidAdjustmentInNormalMode(
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        _requireICRisAboveMCR(_vars.newICR);
        _vars.newTCR = _getNewTCRFromTroveChange(
            _vars.collChange,
            _vars.isCollIncrease,
            _vars.netDebtChange,
            _isDebtIncrease,
            _vars.price
        );
        _requireNewTCRisAboveCCR(_vars.newTCR);
    }

    function _requireValidAdjustmentInCurrentMode(
        bool _isRecoveryMode,
        uint256 _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        if (_isRecoveryMode) {
            _requireValidAdjustmentInRecoveryMode(
                _collWithdrawal,
                _isDebtIncrease,
                _vars
            );
        } else {
            _requireValidAdjustmentInNormalMode(_isDebtIncrease, _vars);
        }
    }

    function _requireSufficientMUSDBalance(
        address _borrower,
        uint256 _debtRepayment
    ) internal view {
        require(
            self.musd.balanceOf(_borrower) >= _debtRepayment,
            "BorrowerOps: Caller doesnt have enough mUSD to make repayment"
        );
    }

    function _requireAtLeastMinNetDebt(uint256 _netDebt) internal view {
        require(
            _netDebt >= self.minNetDebt,
            "BorrowerOps: Trove's net debt must be greater than minimum"
        );
    }

    function _requireValidMUSDRepayment(
        uint256 _currentDebt,
        uint256 _debtRepayment
    ) internal view {
        require(
            _debtRepayment <= _currentDebt - self.musdGasCompensation,
            "BorrowerOps: Amount repaid must not be larger than the Trove's debt"
        );
    }

    /*
     * In Recovery Mode, only allow:
     *
     * - Pure collateral top-up
     * - Pure debt repayment
     * - Collateral top-up with debt repayment
     * - A debt increase combined with a collateral top-up which makes the ICR
     * >= 150% and improves the ICR (and by extension improves the TCR).
     */
    function _requireValidAdjustmentInRecoveryMode(
        uint256 _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal pure {
        _requireNoCollWithdrawal(_collWithdrawal);
        if (_isDebtIncrease) {
            _requireICRisAboveCCR(_vars.newICR);
            _requireNewICRisAboveOldICR(_vars.newICR, _vars.oldICR);
        }
    }

    function _getCollChange(
        uint256 _collReceived,
        uint256 _requestedCollWithdrawal
    ) internal pure returns (uint256 collChange, bool isCollIncrease) {
        if (_collReceived != 0) {
            collChange = _collReceived;
            isCollIncrease = true;
        } else {
            collChange = _requestedCollWithdrawal;
        }
    }

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewICRFromTroveChange(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _price
    ) internal pure returns (uint) {
        (uint256 newColl, uint256 newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );
        uint256 newICR = LiquityMath._computeCR(newColl, newDebt, _price);
        return newICR;
    }

    function _getNewTroveAmounts(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint newColl, uint newDebt) {
        newColl = _isCollIncrease ? _coll + _collChange : _coll - _collChange;
        newDebt = _isDebtIncrease ? _debt + _debtChange : _debt - _debtChange;
    }

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewNominalICRFromTroveChange(
        uint256 _coll,
        uint256 _debt,
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint) {
        (uint256 newColl, uint256 newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );

        return LiquityMath._computeNominalCR(newColl, newDebt);
    }

    function _calculateMaxBorrowingCapacity(
        uint256 _coll,
        uint256 _price
    ) internal pure returns (uint) {
        return (_coll * _price) / (110 * 1e16);
    }

    function _requireValidMaxFeePercentage(
        uint256 _maxFeePercentage,
        bool _isRecoveryMode
    ) internal pure {
        if (_isRecoveryMode) {
            require(
                _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must be less than or equal to 100%"
            );
        } else {
            require(
                _maxFeePercentage >= BORROWING_FEE_FLOOR &&
                    _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must be between 0.5% and 100%"
            );
        }
    }

    function _requireICRisAboveMCR(uint256 _newICR) internal pure {
        require(
            _newICR >= MCR,
            "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
        );
    }

    function _requireICRisAboveCCR(uint256 _newICR) internal pure {
        require(
            _newICR >= CCR,
            "BorrowerOps: Operation must leave trove with ICR >= CCR"
        );
    }

    function _requireNewTCRisAboveCCR(uint256 _newTCR) internal pure {
        require(
            _newTCR >= CCR,
            "BorrowerOps: An operation that would result in TCR < CCR is not permitted"
        );
    }

    function _requireNonZeroDebtChange(uint256 _debtChange) internal pure {
        require(
            _debtChange > 0,
            "BorrowerOps: Debt increase requires non-zero debtChange"
        );
    }

    function _requireSingularCollChange(
        uint256 _collWithdrawal,
        uint256 _assetAmount
    ) internal pure {
        require(
            _assetAmount == 0 || _collWithdrawal == 0,
            "BorrowerOperations: Cannot withdraw and add coll"
        );
    }

    function _requireNonZeroAdjustment(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        uint256 _assetAmount
    ) internal pure {
        require(
            _assetAmount != 0 || _collWithdrawal != 0 || _debtChange != 0,
            "BorrowerOps: There must be either a collateral change or a debt change"
        );
    }

    function _requireNoCollWithdrawal(uint256 _collWithdrawal) internal pure {
        require(
            _collWithdrawal == 0,
            "BorrowerOps: Collateral withdrawal not permitted Recovery Mode"
        );
    }

    function _requireNewICRisAboveOldICR(
        uint256 _newICR,
        uint256 _oldICR
    ) internal pure {
        require(
            _newICR >= _oldICR,
            "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode"
        );
    }
}
