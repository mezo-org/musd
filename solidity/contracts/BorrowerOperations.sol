// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./dependencies/CheckContract.sol";
import "./dependencies/InterestRateMath.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IGovernableVariables.sol";
import "./interfaces/IInterestRateManager.sol";
import "./interfaces/IPCV.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./token/IMUSD.sol";

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
        uint256 maxBorrowingCapacity;
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

    struct LocalVariables_refinance {
        uint256 price;
        ITroveManager troveManagerCached;
        IInterestRateManager interestRateManagerCached;
        uint16 oldRate;
        uint256 oldDebt;
        uint256 amount;
        uint256 fee;
        uint256 newICR;
        uint256 oldPrincipal;
        uint16 newRate;
        uint256 maxBorrowingCapacity;
        uint256 newNICR;
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
        adjustTrove,
        refinanceTrove
    }

    string public constant name = "BorrowerOperations";
    uint256 public constant MIN_NET_DEBT_MIN = 50e18;

    // Connected contract declarations
    ITroveManager public troveManager;
    address public gasPoolAddress;
    IGovernableVariables public governableVariables;
    address public pcvAddress;
    address public stabilityPoolAddress;
    address public borrowerOperationsSignaturesAddress;
    ICollSurplusPool public collSurplusPool;
    IMUSD public musd;
    IPCV public pcv;

    // A doubly linked list of Troves, sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // refinancing fee is always a percentage of the borrowing (issuance) fee
    uint8 public refinancingFeePercentage;

    // Governable Variables

    // Minimum amount of net mUSD debt a trove must have
    uint256 public minNetDebt;
    uint256 public proposedMinNetDebt;
    uint256 public proposedMinNetDebtTime;

    // Borrowering Rate
    uint256 public borrowingRate; // expressed as a percentage in 1e18 precision
    uint256 public proposedBorrowingRate;
    uint256 public proposedBorrowingRateTime;

    // Redemption Rate
    uint256 public redemptionRate; // expressed as a percentage in 1e18 precision
    uint256 public proposedRedemptionRate;
    uint256 public proposedRedemptionRateTime;

    modifier onlyGovernance() {
        require(
            msg.sender == pcv.council() || msg.sender == pcv.treasury(),
            "BorrowerOps: Only governance can call this function"
        );
        _;
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        refinancingFeePercentage = 20;
        minNetDebt = 1800e18;

        borrowingRate = DECIMAL_PRECISION / 200; // 0.5%
        proposedBorrowingRate = borrowingRate;
        // solhint-disable-next-line not-rely-on-time
        proposedBorrowingRateTime = block.timestamp;

        redemptionRate = DECIMAL_PRECISION / 200; // 0.5%
        proposedRedemptionRate = redemptionRate;
        // solhint-disable-next-line not-rely-on-time
        proposedRedemptionRateTime = block.timestamp;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // Calls on PCV behalf
    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external {
        require(
            msg.sender == pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        musd.mint(pcvAddress, _musdToMint);
    }

    function burnDebtFromPCV(uint256 _musdToBurn) external virtual {
        require(
            msg.sender == pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        musd.burn(pcvAddress, _musdToBurn);
    }

    // --- Borrower Trove Operations ---
    function openTrove(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _openTrove(msg.sender, msg.sender, _debtAmount, _upperHint, _lowerHint);
    }

    // Send collateral to a trove
    function addColl(
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _adjustTrove(
            msg.sender,
            msg.sender,
            msg.sender,
            0,
            0,
            false,
            _upperHint,
            _lowerHint
        );
    }

    // Send collateral to a trove. Called by only the Stability Pool.
    function moveCollateralGainToTrove(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _requireCallerIsStabilityPool();
        _adjustTrove(
            _borrower,
            _borrower,
            _borrower,
            0,
            0,
            false,
            _upperHint,
            _lowerHint
        );
    }

    // Withdraw collateral from a trove
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            msg.sender,
            msg.sender,
            _amount,
            0,
            false,
            _upperHint,
            _lowerHint
        );
    }

    // Withdraw mUSD tokens from a trove: mint new mUSD tokens to the owner, and increase the trove's principal accordingly
    function withdrawMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            msg.sender,
            msg.sender,
            0,
            _amount,
            true,
            _upperHint,
            _lowerHint
        );
    }

    // Repay mUSD tokens to a Trove: Burn the repaid mUSD tokens, and reduce the trove's debt accordingly
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            msg.sender,
            msg.sender,
            0,
            _amount,
            false,
            _upperHint,
            _lowerHint
        );
    }

    function closeTrove() external override {
        _closeTrove(msg.sender, msg.sender, msg.sender);
    }

    function refinance(
        address _upperHint,
        address _lowerHint
    ) external override {
        _refinance(msg.sender, _upperHint, _lowerHint);
    }

    /*
     * adjustTrove(): Alongside a debt change, this function can perform either a collateral top-up or a collateral withdrawal.
     *
     * It therefore expects either a positive msg.value, or a positive _collWithdrawal argument.
     *
     * If both are positive, it will revert.
     */
    function adjustTrove(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _adjustTrove(
            msg.sender,
            msg.sender,
            msg.sender,
            _collWithdrawal,
            _debtChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint
        );
    }

    // Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
    function claimCollateral() external override {
        _claimCollateral(msg.sender, msg.sender);
    }

    function setAddresses(address[13] memory _addresses) external onlyOwner {
        // This makes impossible to open a trove with zero withdrawn mUSD
        assert(minNetDebt > 0);

        uint addressLength = _addresses.length;
        for (uint i = 0; i < addressLength; i++) {
            checkContract(_addresses[i]);
        }

        // slither-disable-start missing-zero-check
        activePool = IActivePool(_addresses[0]);
        borrowerOperationsSignaturesAddress = _addresses[1];
        collSurplusPool = ICollSurplusPool(_addresses[2]);
        defaultPool = IDefaultPool(_addresses[3]);
        gasPoolAddress = _addresses[4];
        governableVariables = IGovernableVariables(_addresses[5]);
        interestRateManager = IInterestRateManager(_addresses[6]);
        musd = IMUSD(_addresses[7]);
        pcv = IPCV(_addresses[8]);
        pcvAddress = _addresses[8];
        priceFeed = IPriceFeed(_addresses[9]);
        sortedTroves = ISortedTroves(_addresses[10]);
        stabilityPoolAddress = _addresses[11];
        troveManager = ITroveManager(_addresses[12]);
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_addresses[0]);
        emit BorrowerOperationsSignaturesAddressChanged(_addresses[1]);
        emit CollSurplusPoolAddressChanged(_addresses[2]);
        emit DefaultPoolAddressChanged(_addresses[3]);
        emit GasPoolAddressChanged(_addresses[4]);
        emit GovernableVariablesAddressChanged(_addresses[5]);
        emit InterestRateManagerAddressChanged(_addresses[6]);
        emit MUSDTokenAddressChanged(_addresses[7]);
        emit PCVAddressChanged(_addresses[8]);
        emit PriceFeedAddressChanged(_addresses[9]);
        emit SortedTrovesAddressChanged(_addresses[10]);
        emit StabilityPoolAddressChanged(_addresses[11]);
        emit TroveManagerAddressChanged(_addresses[12]);

        renounceOwnership();
    }

    function setRefinancingFeePercentage(
        uint8 _refinanceFeePercentage
    ) external override onlyGovernance {
        require(
            _refinanceFeePercentage <= 100,
            "BorrowerOps: Refinancing fee percentage must be <= 100"
        );
        refinancingFeePercentage = _refinanceFeePercentage;
        emit RefinancingFeePercentageChanged(_refinanceFeePercentage);
    }

    function proposeMinNetDebt(uint256 _minNetDebt) external onlyGovernance {
        require(
            _minNetDebt >= MIN_NET_DEBT_MIN,
            "Minimum Net Debt must be at least $50."
        );
        proposedMinNetDebt = _minNetDebt;
        // solhint-disable-next-line not-rely-on-time
        proposedMinNetDebtTime = block.timestamp;
        emit MinNetDebtProposed(proposedMinNetDebt, proposedMinNetDebtTime);
    }

    function approveMinNetDebt() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= proposedMinNetDebtTime + 7 days,
            "Must wait at least 7 days before approving a change to Minimum Net Debt"
        );
        require(
            proposedMinNetDebt >= MIN_NET_DEBT_MIN,
            "Minimum Net Debt must be at least $50."
        );
        minNetDebt = proposedMinNetDebt;
        emit MinNetDebtChanged(minNetDebt);
    }

    function proposeBorrowingRate(uint256 _fee) external onlyGovernance {
        require(_fee <= 1e18, "Origination Fee must be at most 100%.");
        proposedBorrowingRate = _fee;
        proposedBorrowingRateTime = block.timestamp;
        emit BorrowingRateProposed(
            proposedBorrowingRate,
            proposedBorrowingRateTime
        );
    }

    function approveBorrowingRate() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= proposedBorrowingRateTime + 7 days,
            "Must wait at least 7 days before approving a change to Origination Fee"
        );
        borrowingRate = proposedBorrowingRate;
        emit BorrowingRateChanged(borrowingRate);
    }

    function proposeRedemptionRate(uint256 _rate) external onlyGovernance {
        require(_rate <= 1e18, "Redemption Rate must be at most 100%.");
        proposedRedemptionRate = _rate;
        proposedRedemptionRateTime = block.timestamp;
        emit RedemptionRateProposed(
            proposedRedemptionRate,
            proposedRedemptionRateTime
        );
    }

    function approveRedemptionRate() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= proposedRedemptionRateTime + 7 days,
            "Must wait at least 7 days before approving a change to Redemption Rate"
        );
        redemptionRate = proposedRedemptionRate;
        emit RedemptionRateChanged(redemptionRate);
    }

    function restrictedClaimCollateral(
        address _borrower,
        address _recipient
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _claimCollateral(_borrower, _recipient);
    }

    function restrictedOpenTrove(
        address _borrower,
        address _recipient,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        _requireCallerIsBorrowerOperationsSignatures();
        _openTrove(_borrower, _recipient, _debtAmount, _upperHint, _lowerHint);
    }

    function restrictedCloseTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _closeTrove(_borrower, _caller, _recipient);
    }

    function restrictedRefinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _refinance(_borrower, _upperHint, _lowerHint);
    }

    function restrictedAdjustTrove(
        address _borrower,
        address _recipient,
        address _caller,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable {
        _requireCallerIsBorrowerOperationsSignatures();
        _adjustTrove(
            _borrower,
            _recipient,
            _caller,
            _collWithdrawal,
            _mUSDChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint
        );
    }

    function getRedemptionRate(
        uint256 _collateralDrawn
    ) external view returns (uint256) {
        uint256 fee = (redemptionRate * _collateralDrawn) / DECIMAL_PRECISION;
        require(
            fee < _collateralDrawn,
            "BorrowerOperations: Fee would eat up all returned collateral"
        );
        return fee;
    }

    function getBorrowingFee(uint256 _debt) public view returns (uint) {
        return (_debt * borrowingRate) / DECIMAL_PRECISION;
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
        address _caller,
        address _recipient,
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
                _recipient,
                _principalChange,
                _netDebtChange
            );
        } else {
            _repayMUSD(
                _activePool,
                _musd,
                _caller,
                _principalChange,
                _interestChange
            );
        }

        if (_isCollIncrease) {
            _activePoolAddColl(_activePool, _collChange);
        } else {
            _activePool.sendCollateral(_recipient, _collChange);
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
        IMUSD _musd,
        uint256 _amount
    ) internal returns (uint) {
        uint256 fee = getBorrowingFee(_amount);

        // Send fee to PCV contract
        _musd.mint(pcvAddress, fee);
        return fee;
    }

    function _openTrove(
        address _borrower,
        address _recipient,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) internal {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            musd,
            interestRateManager
        );
        contractsCache.troveManager.updateSystemInterest();
        // slither-disable-next-line uninitialized-local
        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        _requireTroveisNotActive(contractsCache.troveManager, _borrower);

        vars.netDebt = _debtAmount;

        if (
            !isRecoveryMode &&
            !governableVariables.isAccountFeeExempt(_borrower)
        ) {
            vars.fee = _triggerBorrowingFee(contractsCache.musd, _debtAmount);
            vars.netDebt += vars.fee;
        }

        _requireAtLeastMinNetDebt(vars.netDebt);

        // ICR is based on the composite debt, i.e. the requested amount + borrowing fee + gas comp.
        vars.compositeDebt = _getCompositeDebt(vars.netDebt);

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

        sortedTroves.insert(_borrower, vars.NICR, _upperHint, _lowerHint);
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
            _recipient,
            _debtAmount,
            vars.netDebt
        );

        // Move the mUSD gas compensation to the Gas Pool
        _withdrawMUSD(
            contractsCache.activePool,
            contractsCache.musd,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            MUSD_GAS_COMPENSATION
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

    function _adjustTrove(
        address _borrower,
        address _recipient,
        address _caller,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) internal {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            musd,
            interestRateManager
        );

        contractsCache.troveManager.updateSystemAndTroveInterest(_borrower);

        // slither-disable-next-line uninitialized-local
        LocalVariables_adjustTrove memory vars;

        // Snapshot interest and principal before repayment so we can correctly adjust the active pool
        vars.interestOwed = contractsCache.troveManager.getTroveInterestOwed(
            _borrower
        );

        (vars.principalAdjustment, vars.interestAdjustment) = InterestRateMath
            .calculateDebtAdjustment(vars.interestOwed, _mUSDChange);

        vars.price = priceFeed.fetchPrice();
        vars.isRecoveryMode = _checkRecoveryMode(vars.price);

        if (_isDebtIncrease) {
            _requireNonZeroDebtChange(_mUSDChange);
        }
        _requireSingularCollChange(_collWithdrawal, msg.value);
        _requireNonZeroAdjustment(_collWithdrawal, _mUSDChange, msg.value);
        _requireTroveisActive(contractsCache.troveManager, _borrower);

        /*
         * Confirm the operation is either a borrower adjusting their own trove (either directly or through
         * a signature), or a pure collateral transfer from the Stability Pool to a trove
         */
        assert(
            msg.sender == _borrower ||
                (msg.sender == stabilityPoolAddress &&
                    msg.value > 0 &&
                    _mUSDChange == 0) ||
                msg.sender == address(this) ||
                msg.sender == borrowerOperationsSignaturesAddress
        );

        // Get the collChange based on whether or not collateral was sent in the transaction
        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            msg.value,
            _collWithdrawal
        );

        vars.netDebtChange = _mUSDChange;

        // If the adjustment incorporates a principal increase and system is in Normal Mode, then trigger a borrowing fee
        if (_isDebtIncrease && !vars.isRecoveryMode) {
            vars.fee = _triggerBorrowingFee(contractsCache.musd, _mUSDChange);
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

        vars.maxBorrowingCapacity = contractsCache
            .troveManager
            .getTroveMaxBorrowingCapacity(_borrower);
        if (_isDebtIncrease) {
            _requireHasBorrowingCapacity(vars);
        }

        // When the adjustment is a debt repayment, check it's a valid amount and that the caller has enough mUSD
        if (!_isDebtIncrease && _mUSDChange > 0) {
            _requireAtLeastMinNetDebt(
                _getNetDebt(vars.debt) - vars.netDebtChange
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

        // If collateral was withdrawn, update the maxBorrowingCapacity
        if (!vars.isCollIncrease && vars.collChange > 0) {
            uint256 newMaxBorrowingCapacity = _calculateMaxBorrowingCapacity(
                vars.newColl,
                vars.price
            );

            uint256 currentMaxBorrowingCapacity = contractsCache
                .troveManager
                .getTroveMaxBorrowingCapacity(_borrower);

            uint256 finalMaxBorrowingCapacity = LiquityMath._min(
                currentMaxBorrowingCapacity,
                newMaxBorrowingCapacity
            );

            contractsCache.troveManager.setTroveMaxBorrowingCapacity(
                _borrower,
                finalMaxBorrowingCapacity
            );
        }

        // Re-insert trove in to the sorted list
        vars.newNICR = LiquityMath._computeNominalCR(
            vars.newColl,
            vars.newPrincipal
        );
        sortedTroves.reInsert(_borrower, vars.newNICR, _upperHint, _lowerHint);

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
            _caller,
            _recipient,
            vars.collChange,
            vars.isCollIncrease,
            _isDebtIncrease ? _mUSDChange : vars.principalAdjustment,
            vars.interestAdjustment,
            _isDebtIncrease,
            vars.netDebtChange
        );
    }

    function _closeTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) internal {
        ITroveManager troveManagerCached = troveManager;
        troveManagerCached.updateSystemAndTroveInterest(_borrower);

        IActivePool activePoolCached = activePool;
        IMUSD musdTokenCached = musd;
        bool canMint = musdTokenCached.mintList(address(this));

        _requireTroveisActive(troveManagerCached, _borrower);
        uint256 price = priceFeed.fetchPrice();
        if (canMint) {
            _requireNotInRecoveryMode(price);
        }

        uint256 coll = troveManagerCached.getTroveColl(_borrower);
        uint256 debt = troveManagerCached.getTroveDebt(_borrower);
        uint256 interestOwed = troveManagerCached.getTroveInterestOwed(
            _borrower
        );

        _requireSufficientMUSDBalance(_caller, debt - MUSD_GAS_COMPENSATION);
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
            debt - MUSD_GAS_COMPENSATION - interestOwed,
            interestOwed
        );

        // Burn the repaid mUSD from the user's balance
        musdTokenCached.burn(_caller, debt - MUSD_GAS_COMPENSATION);

        // Burn the gas compensation from the gas pool
        _repayMUSD(
            activePoolCached,
            musdTokenCached,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            0
        );

        // Send the collateral back to the user
        activePoolCached.sendCollateral(_recipient, coll);
    }

    function _refinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) internal {
        // slither-disable-next-line uninitialized-local
        LocalVariables_refinance memory vars;
        vars.price = priceFeed.fetchPrice();
        vars.troveManagerCached = troveManager;
        vars.troveManagerCached.updateSystemAndTroveInterest(_borrower);

        _requireNotInRecoveryMode(vars.price);
        _requireTroveisActive(vars.troveManagerCached, _borrower);

        vars.interestRateManagerCached = interestRateManager;

        vars.oldRate = vars.troveManagerCached.getTroveInterestRate(_borrower);
        vars.oldDebt = _getNetDebt(
            vars.troveManagerCached.getTroveDebt(_borrower)
        );
        vars.amount = (refinancingFeePercentage * vars.oldDebt) / 100;
        uint256 fee = governableVariables.isAccountFeeExempt(_borrower)
            ? 0
            : _triggerBorrowingFee(musd, vars.amount);
        // slither-disable-next-line unused-return
        vars.troveManagerCached.increaseTroveDebt(_borrower, fee);
        if (fee > 0) {
            activePool.increaseDebt(fee, 0);
        }

        // slither-disable-start unused-return
        (
            uint256 newColl,
            uint256 newPrincipal,
            uint256 newInterest,
            ,
            ,

        ) = vars.troveManagerCached.getEntireDebtAndColl(_borrower);
        // slither-disable-end unused-return

        vars.newICR = LiquityMath._computeCR(
            newColl,
            newPrincipal + newInterest,
            vars.price
        );
        _requireICRisAboveMCR(vars.newICR);
        _requireNewTCRisAboveCCR(vars.troveManagerCached.getTCR(vars.price));

        vars.oldPrincipal = vars.troveManagerCached.getTrovePrincipal(
            _borrower
        );

        vars.interestRateManagerCached.removePrincipal(
            vars.oldPrincipal,
            vars.oldRate
        );
        vars.newRate = vars.interestRateManagerCached.interestRate();
        vars.interestRateManagerCached.addPrincipal(
            vars.oldPrincipal,
            vars.newRate
        );

        vars.troveManagerCached.setTroveInterestRate(
            _borrower,
            vars.interestRateManagerCached.interestRate()
        );

        vars.maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            vars.troveManagerCached.getTroveColl(_borrower),
            vars.price
        );
        vars.troveManagerCached.setTroveMaxBorrowingCapacity(
            _borrower,
            vars.maxBorrowingCapacity
        );

        // Re-insert trove in to the sorted list
        vars.newNICR = LiquityMath._computeNominalCR(newColl, newPrincipal);
        sortedTroves.reInsert(_borrower, vars.newNICR, _upperHint, _lowerHint);

        // slither-disable-start reentrancy-events
        emit RefinancingFeePaid(_borrower, fee);
        emit TroveUpdated(
            _borrower,
            newPrincipal,
            newInterest,
            newColl,
            vars.troveManagerCached.updateStakeAndTotalStakes(_borrower),
            uint8(BorrowerOperation.refinanceTrove)
        );
        // slither-disable-end reentrancy-events
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

    function _claimCollateral(address _borrower, address _recipient) internal {
        troveManager.updateSystemInterest();

        // send collateral from CollSurplus Pool to owner
        collSurplusPool.claimColl(_borrower, _recipient);
    }

    function _requireCallerIsBorrowerOperationsSignatures() internal view {
        require(
            msg.sender == borrowerOperationsSignaturesAddress,
            "BorrowerOps: Caller is not BorrowerOperationsSignatures"
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
            msg.sender == stabilityPoolAddress,
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
            musd.balanceOf(_borrower) >= _debtRepayment,
            "BorrowerOps: Caller doesnt have enough mUSD to make repayment"
        );
    }

    function _requireAtLeastMinNetDebt(uint256 _netDebt) internal view {
        require(
            _netDebt >= minNetDebt,
            "BorrowerOps: Trove's net debt must be greater than minimum"
        );
    }

    function _requireValidMUSDRepayment(
        uint256 _currentDebt,
        uint256 _debtRepayment
    ) internal pure {
        require(
            _debtRepayment <= _currentDebt - MUSD_GAS_COMPENSATION,
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

    function _calculateMaxBorrowingCapacity(
        uint256 _coll,
        uint256 _price
    ) internal pure returns (uint) {
        return (_coll * _price) / (110 * 1e16);
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

    function _requireHasBorrowingCapacity(
        LocalVariables_adjustTrove memory _vars
    ) internal pure {
        require(
            _vars.maxBorrowingCapacity >=
                _vars.netDebtChange + _vars.debt + _vars.interestOwed,
            "BorrowerOps: An operation that exceeds maxBorrowingCapacity is not permitted"
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
