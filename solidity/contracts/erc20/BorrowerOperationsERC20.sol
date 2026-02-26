// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/InterestRateMath.sol";
import "../dependencies/LiquityBase.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/IBorrowerOperationsERC20.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";
import "../interfaces/IGovernableVariables.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/IPCV.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/ITroveManager.sol";
import "../token/IMUSD.sol";

/**
 * @title BorrowerOperationsERC20
 * @notice Main user interface for trove management with ERC20 collateral
 * @dev This is a skeleton implementation demonstrating the ERC20 pattern.
 *      Key differences from native version:
 *      - No payable modifiers
 *      - Explicit _collAmount parameters instead of msg.value
 *      - ERC20 transferFrom for deposits
 *      - ERC20 transfer for withdrawals
 *
 *      Full implementation requires:
 *      - Complete internal functions (_openTrove, _adjustTrove, _closeTrove, _refinance)
 *      - All helper functions from original BorrowerOperations
 *      - Proper integration with ERC20 pool contracts
 *      - Comprehensive testing
 */
contract BorrowerOperationsERC20 is
    CheckContract,
    IBorrowerOperationsERC20,
    LiquityBase,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    // --- Variable container structs (same as native version) ---

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
        uint16 interestRate;
    }

    struct LocalVariables_openTrove {
        uint256 price;
        uint256 fee;
        uint256 netDebt;
        uint256 ICR;
        uint256 NICR;
        uint256 stake;
        uint256 arrayIndex;
        uint16 interestRate;
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
        IActivePoolERC20 activePoolERC20;
        IMUSD musd;
        IInterestRateManager interestRateManager;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove,
        refinanceTrove
    }

    string public constant name = "BorrowerOperationsERC20";
    uint256 public constant MIN_NET_DEBT_MIN = 50e18;

    // Connected contract declarations
    address public collateralToken;
    IActivePoolERC20 public activePoolERC20;
    ITroveManager public troveManager;
    address public gasPoolAddress;
    IGovernableVariables internal _governableVariables;
    address public pcvAddress;
    address public stabilityPoolAddress;
    address public borrowerOperationsSignaturesAddress;
    ICollSurplusPoolERC20 public collSurplusPool;
    IMUSD public musd;
    IPCV public pcv;

    ISortedTroves public sortedTroves;

    uint8 public refinancingFeePercentage;

    // Governable Variables
    uint256 public minNetDebt;
    uint256 public proposedMinNetDebt;
    uint256 public proposedMinNetDebtTime;

    uint256 public borrowingRate;
    uint256 public proposedBorrowingRate;
    uint256 public proposedBorrowingRateTime;

    uint256 public redemptionRate;
    uint256 public proposedRedemptionRate;
    uint256 public proposedRedemptionRateTime;

    modifier onlyGovernance() {
        require(
            msg.sender == pcv.council() || msg.sender == pcv.treasury(),
            "BorrowerOpsERC20: Only governance can call this function"
        );
        _;
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        refinancingFeePercentage = 20;
        minNetDebt = 1800e18;

        borrowingRate = DECIMAL_PRECISION / 1000; // 0.1%
        proposedBorrowingRate = borrowingRate;
        // solhint-disable-next-line not-rely-on-time
        proposedBorrowingRateTime = block.timestamp;

        redemptionRate = (DECIMAL_PRECISION * 3) / 400; // 0.75%
        proposedRedemptionRate = redemptionRate;
        // solhint-disable-next-line not-rely-on-time
        proposedRedemptionRateTime = block.timestamp;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Contract Setup ---

    function setAddresses(
        address[13] memory addresses
    ) external override onlyOwner {
        require(
            addresses[0] != address(0),
            "BorrowerOpsERC20: Collateral token cannot be zero"
        );

        // Check all contracts
        checkContract(addresses[1]); // activePool
        checkContract(addresses[2]); // defaultPool
        checkContract(addresses[3]); // stabilityPool
        checkContract(addresses[4]); // gasPool
        checkContract(addresses[5]); // collSurplusPool
        checkContract(addresses[6]); // priceFeed
        checkContract(addresses[7]); // sortedTroves
        checkContract(addresses[8]); // musdToken
        checkContract(addresses[9]); // troveManager
        checkContract(addresses[10]); // interestRateManager
        checkContract(addresses[11]); // governableVariables
        checkContract(addresses[12]); // pcv

        collateralToken = addresses[0];
        activePoolERC20 = IActivePoolERC20(addresses[1]);
        stabilityPoolAddress = addresses[3];
        gasPoolAddress = addresses[4];
        collSurplusPool = ICollSurplusPoolERC20(addresses[5]);
        priceFeed = IPriceFeed(addresses[6]);
        sortedTroves = ISortedTroves(addresses[7]);
        musd = IMUSD(addresses[8]);
        troveManager = ITroveManager(addresses[9]);
        interestRateManager = IInterestRateManager(addresses[10]);
        _governableVariables = IGovernableVariables(addresses[11]);
        pcvAddress = addresses[12];
        pcv = IPCV(addresses[12]);

        emit ActivePoolAddressChanged(addresses[1]);
        emit DefaultPoolAddressChanged(addresses[2]);
        emit StabilityPoolAddressChanged(addresses[3]);
        emit GasPoolAddressChanged(addresses[4]);
        emit CollSurplusPoolAddressChanged(addresses[5]);
        emit PriceFeedAddressChanged(addresses[6]);
        emit SortedTrovesAddressChanged(addresses[7]);
        emit MUSDTokenAddressChanged(addresses[8]);
        emit TroveManagerAddressChanged(addresses[9]);
        emit InterestRateManagerAddressChanged(addresses[10]);
        emit GovernableVariablesAddressChanged(addresses[11]);
        emit PCVAddressChanged(addresses[12]);

        renounceOwnership();
    }

    // --- Borrower Trove Operations ---

    /**
     * @notice Open a new trove with ERC20 collateral
     * @dev User must approve this contract to spend collateralToken first
     * @param _collAmount Amount of ERC20 collateral to deposit
     * @param _debtAmount Amount of mUSD to borrow
     */
    function openTrove(
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        // Transfer collateral from user to ActivePoolERC20
        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(activePoolERC20),
            _collAmount
        );

        // Notify ActivePoolERC20 of the deposit
        activePoolERC20.receiveCollateral(_collAmount);

        // Call internal function
        _openTrove(msg.sender, msg.sender, _collAmount, _debtAmount, _upperHint, _lowerHint);
    }

    /**
     * @notice Add ERC20 collateral to an existing trove
     */
    function addColl(
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        require(
            _collAmount > 0,
            "BorrowerOpsERC20: Cannot add zero collateral"
        );

        // Transfer collateral from user to ActivePoolERC20
        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(activePoolERC20),
            _collAmount
        );

        // Notify ActivePoolERC20 of the deposit
        activePoolERC20.receiveCollateral(_collAmount);

        // Call _adjustTrove with collateral increase
        _adjustTrove(
            msg.sender,
            msg.sender,
            msg.sender,
            _collAmount,
            0,
            0,
            false,
            _upperHint,
            _lowerHint
        );
    }

    /**
     * @notice Withdraw ERC20 collateral from trove
     */
    function withdrawColl(
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
            0,
            false,
            _upperHint,
            _lowerHint
        );
    }

    /**
     * @notice Withdraw mUSD (increase debt)
     */
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
            0,
            _amount,
            true,
            _upperHint,
            _lowerHint
        );
    }

    /**
     * @notice Repay mUSD (decrease debt)
     */
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
            0,
            _amount,
            false,
            _upperHint,
            _lowerHint
        );
    }

    /**
     * @notice Close trove by repaying all debt
     */
    function closeTrove() external override {
        _closeTrove(msg.sender, msg.sender, msg.sender);
    }

    /**
     * @notice Adjust trove with both collateral and debt changes
     * @param _collDeposit Amount of collateral to deposit (0 if none)
     * @param _collWithdrawal Amount of collateral to withdraw (0 if none)
     */
    function adjustTrove(
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external override {
        require(
            _collDeposit == 0 || _collWithdrawal == 0,
            "BorrowerOpsERC20: Cannot deposit and withdraw"
        );

        if (_collDeposit > 0) {
            // Transfer collateral from user
            IERC20(collateralToken).safeTransferFrom(
                msg.sender,
                address(activePoolERC20),
                _collDeposit
            );
            activePoolERC20.receiveCollateral(_collDeposit);
        }

        _adjustTrove(
            msg.sender,
            msg.sender,
            msg.sender,
            _collDeposit,
            _collWithdrawal,
            _debtChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint
        );
    }

    /**
     * @notice Refinance to current interest rate
     */
    function refinance(
        address _upperHint,
        address _lowerHint
    ) external override {
        _refinance(msg.sender, _upperHint, _lowerHint);
    }

    /**
     * @notice Claim surplus collateral after redemption
     */
    function claimCollateral() external override {
        collSurplusPool.claimColl(msg.sender, msg.sender);
    }

    // --- Restricted Functions (for signatures contract) ---

    function restrictedOpenTrove(
        address _borrower,
        address _recipient,
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedOpenTrove not fully implemented");
    }

    function restrictedCloseTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedCloseTrove not fully implemented");
    }

    function restrictedAdjustTrove(
        address _borrower,
        address _recipient,
        address _caller,
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedAdjustTrove not fully implemented");
    }

    function restrictedRefinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        // TODO: Implement
        revert("BorrowerOpsERC20: restrictedRefinance not fully implemented");
    }

    function restrictedClaimCollateral(
        address _borrower,
        address _recipient
    ) external override {
        _requireCallerIsBorrowerOperationsSignatures();
        collSurplusPool.claimColl(_borrower, _recipient);
    }

    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsStabilityPool();
        // TODO: Implement
        revert(
            "BorrowerOpsERC20: moveCollateralGainToTrove not fully implemented"
        );
    }

    // --- PCV Functions ---

    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external {
        require(
            msg.sender == pcvAddress,
            "BorrowerOpsERC20: caller must be PCV"
        );
        musd.mint(pcvAddress, _musdToMint);
    }

    function burnDebtFromPCV(uint256 _musdToBurn) external virtual {
        require(
            msg.sender == pcvAddress,
            "BorrowerOpsERC20: caller must be PCV"
        );
        musd.burn(pcvAddress, _musdToBurn);
    }

    // --- Governance Functions ---

    function setRefinancingFeePercentage(
        uint8 _refinanceFeePercentage
    ) external override onlyGovernance {
        require(
            _refinanceFeePercentage <= 100,
            "BorrowerOpsERC20: Fee percentage must be <= 100"
        );
        refinancingFeePercentage = _refinanceFeePercentage;
        emit RefinancingFeePercentageChanged(_refinanceFeePercentage);
    }

    function proposeMinNetDebt(
        uint256 _minNetDebt
    ) external override onlyGovernance {
        require(
            _minNetDebt >= MIN_NET_DEBT_MIN,
            "BorrowerOpsERC20: Min net debt too low"
        );
        proposedMinNetDebt = _minNetDebt;
        // solhint-disable-next-line not-rely-on-time
        proposedMinNetDebtTime = block.timestamp;
        emit MinNetDebtProposed(_minNetDebt, block.timestamp);
    }

    function approveMinNetDebt() external override onlyGovernance {
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= proposedMinNetDebtTime + 7 days,
            "BorrowerOpsERC20: Governance delay not met"
        );
        minNetDebt = proposedMinNetDebt;
        emit MinNetDebtChanged(minNetDebt);
    }

    function proposeBorrowingRate(
        uint256 _fee
    ) external override onlyGovernance {
        proposedBorrowingRate = _fee;
        // solhint-disable-next-line not-rely-on-time
        proposedBorrowingRateTime = block.timestamp;
        emit BorrowingRateProposed(_fee, block.timestamp);
    }

    function approveBorrowingRate() external override onlyGovernance {
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= proposedBorrowingRateTime + 7 days,
            "BorrowerOpsERC20: Governance delay not met"
        );
        borrowingRate = proposedBorrowingRate;
        emit BorrowingRateChanged(borrowingRate);
    }

    function proposeRedemptionRate(
        uint256 _fee
    ) external override onlyGovernance {
        proposedRedemptionRate = _fee;
        // solhint-disable-next-line not-rely-on-time
        proposedRedemptionRateTime = block.timestamp;
        emit RedemptionRateProposed(_fee, block.timestamp);
    }

    function approveRedemptionRate() external override onlyGovernance {
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= proposedRedemptionRateTime + 7 days,
            "BorrowerOpsERC20: Governance delay not met"
        );
        redemptionRate = proposedRedemptionRate;
        emit RedemptionRateChanged(redemptionRate);
    }

    // --- View Functions ---

    function getBorrowingFee(
        uint256 _debt
    ) public view override returns (uint) {
        return _calcBorrowingFee(_debt);
    }

    function getRedemptionRate(
        uint256 _collateralDrawn
    ) external view override returns (uint256) {
        return _calcRedemptionRate(_collateralDrawn);
    }

    function governableVariables()
        external
        view
        override
        returns (IGovernableVariables)
    {
        return _governableVariables;
    }

    // --- Internal Helper Functions ---

    function _calcBorrowingFee(uint256 _debt) internal view returns (uint) {
        return (_debt * borrowingRate) / DECIMAL_PRECISION;
    }

    function _calcRedemptionRate(
        uint256 _collateralDrawn
    ) internal view returns (uint256) {
        return (_collateralDrawn * redemptionRate) / DECIMAL_PRECISION;
    }

    // --- Require Functions ---

    function _requireCallerIsBorrowerOperationsSignatures() internal view {
        require(
            msg.sender == borrowerOperationsSignaturesAddress,
            "BorrowerOpsERC20: Caller not BorrowerOperationsSignatures"
        );
    }

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "BorrowerOpsERC20: Caller is not Stability Pool"
        );
    }

    // --- Internal Core Functions ---

    /**
     * @notice Internal function to open a new trove with ERC20 collateral
     * @dev Collateral must already be transferred to ActivePoolERC20 before calling
     */
    function _openTrove(
        address _borrower,
        address _recipient,
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) internal {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePoolERC20,
            musd,
            interestRateManager
        );
        contractsCache.troveManager.updateSystemInterest();

        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        _requireTroveisNotActive(contractsCache.troveManager, _borrower);

        vars.netDebt = _debtAmount;

        if (
            !isRecoveryMode &&
            !_governableVariables.isAccountFeeExempt(_borrower)
        ) {
            vars.fee = _triggerBorrowingFee(contractsCache.musd, _debtAmount);
            vars.netDebt += vars.fee;
        }

        _requireAtLeastMinNetDebt(vars.netDebt);

        uint256 compositeDebt = _getCompositeDebt(vars.netDebt);

        vars.ICR = LiquityMath._computeCR(_collAmount, compositeDebt, vars.price);
        vars.NICR = LiquityMath._computeNominalCR(_collAmount, compositeDebt);

        if (isRecoveryMode) {
            _requireICRisAboveCCR(vars.ICR);
        } else {
            _requireICRisAboveMCR(vars.ICR);
            uint256 newTCR = _getNewTCRFromTroveChange(
                _collAmount,
                true,
                compositeDebt,
                true,
                vars.price
            );
            _requireNewTCRisAboveCCR(newTCR);
        }

        vars.interestRate = contractsCache.interestRateManager.interestRate();
        contractsCache.troveManager.setTroveInterestRate(
            _borrower,
            vars.interestRate
        );

        contractsCache.troveManager.setTroveStatus(
            _borrower,
            ITroveManager.Status.active
        );
        contractsCache.troveManager.increaseTroveColl(_borrower, _collAmount);
        contractsCache.troveManager.increaseTroveDebt(_borrower, compositeDebt);

        // solhint-disable-next-line not-rely-on-time
        contractsCache.troveManager.setTroveLastInterestUpdateTime(
            _borrower,
            block.timestamp
        );

        uint256 maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            _collAmount,
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

        // Mint mUSD to recipient
        _withdrawMUSD(
            contractsCache.activePoolERC20,
            contractsCache.musd,
            _recipient,
            _debtAmount,
            vars.netDebt
        );

        // Mint gas compensation to Gas Pool
        _withdrawMUSD(
            contractsCache.activePoolERC20,
            contractsCache.musd,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            MUSD_GAS_COMPENSATION
        );

        emit TroveCreated(_borrower, vars.arrayIndex);
        // solhint-disable-next-line not-rely-on-time
        emit TroveUpdated(
            _borrower,
            compositeDebt,
            0,
            _collAmount,
            vars.stake,
            vars.interestRate,
            block.timestamp,
            uint8(BorrowerOperation.openTrove)
        );
        emit BorrowingFeePaid(_borrower, vars.fee);
    }

    /**
     * @notice Internal function to adjust an existing trove
     */
    function _adjustTrove(
        address _borrower,
        address _recipient,
        address _caller,
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) internal {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePoolERC20,
            musd,
            interestRateManager
        );

        contractsCache.troveManager.updateSystemAndTroveInterest(_borrower);

        LocalVariables_adjustTrove memory vars;

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
        _requireSingularCollChange(_collWithdrawal, _collDeposit);
        _requireNonZeroAdjustment(_collWithdrawal, _mUSDChange, _collDeposit);
        _requireTroveisActive(contractsCache.troveManager, _borrower);

        // Confirm authorized caller
        assert(
            msg.sender == _borrower ||
                (msg.sender == stabilityPoolAddress &&
                    _collDeposit > 0 &&
                    _mUSDChange == 0) ||
                msg.sender == borrowerOperationsSignaturesAddress
        );

        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            _collDeposit,
            _collWithdrawal
        );

        vars.netDebtChange = _mUSDChange;

        if (_isDebtIncrease && !vars.isRecoveryMode) {
            vars.fee = _governableVariables.isAccountFeeExempt(_borrower)
                ? 0
                : _triggerBorrowingFee(contractsCache.musd, _mUSDChange);
            vars.netDebtChange += vars.fee;
        }

        vars.debt = contractsCache.troveManager.getTroveDebt(_borrower);
        vars.coll = contractsCache.troveManager.getTroveColl(_borrower);
        vars.interestRate = contractsCache.troveManager.getTroveInterestRate(
            _borrower
        );

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

        if (!_isDebtIncrease && _mUSDChange > 0) {
            _requireAtLeastMinNetDebt(
                _getNetDebt(vars.debt) - vars.netDebtChange
            );
            _requireValidMUSDRepayment(vars.debt, vars.netDebtChange);
            _requireSufficientMUSDBalance(_caller, vars.netDebtChange);
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

        vars.newNICR = LiquityMath._computeNominalCR(
            vars.newColl,
            vars.newPrincipal
        );
        sortedTroves.reInsert(_borrower, vars.newNICR, _upperHint, _lowerHint);

        // solhint-disable-next-line not-rely-on-time
        emit TroveUpdated(
            _borrower,
            vars.newPrincipal,
            vars.newInterest,
            vars.newColl,
            vars.stake,
            vars.interestRate,
            block.timestamp,
            uint8(BorrowerOperation.adjustTrove)
        );
        emit BorrowingFeePaid(_borrower, vars.fee);

        _moveTokensAndCollateralfromAdjustment(
            contractsCache.activePoolERC20,
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

    /**
     * @notice Internal function to close a trove
     */
    function _closeTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) internal {
        ITroveManager troveManagerCached = troveManager;
        troveManagerCached.updateSystemAndTroveInterest(_borrower);

        IActivePoolERC20 activePoolCached = activePoolERC20;
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

        emit TroveUpdated(
            _borrower,
            0,
            0,
            0,
            0,
            0,
            0,
            uint8(BorrowerOperation.closeTrove)
        );

        activePoolCached.decreaseDebt(
            debt - MUSD_GAS_COMPENSATION - interestOwed,
            interestOwed
        );

        musdTokenCached.burn(_caller, debt - MUSD_GAS_COMPENSATION);

        _repayMUSD(
            activePoolCached,
            musdTokenCached,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            0
        );

        // Send collateral back to user using ERC20 transfer
        activePoolCached.sendCollateral(_recipient, coll);
    }

    /**
     * @notice Internal function to refinance a trove
     */
    function _refinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) internal {
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
        uint256 fee = _governableVariables.isAccountFeeExempt(_borrower)
            ? 0
            : _triggerBorrowingFee(musd, vars.amount);

        vars.troveManagerCached.increaseTroveDebt(_borrower, fee);
        if (fee > 0) {
            activePoolERC20.increaseDebt(fee, 0);
        }

        (
            uint256 newColl,
            uint256 newPrincipal,
            uint256 newInterest,
            ,
            ,

        ) = vars.troveManagerCached.getEntireDebtAndColl(_borrower);

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

        vars.troveManagerCached.setTroveInterestRate(_borrower, vars.newRate);

        vars.maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            vars.troveManagerCached.getTroveColl(_borrower),
            vars.price
        );
        vars.troveManagerCached.setTroveMaxBorrowingCapacity(
            _borrower,
            vars.maxBorrowingCapacity
        );

        vars.newNICR = LiquityMath._computeNominalCR(newColl, newPrincipal);
        sortedTroves.reInsert(_borrower, vars.newNICR, _upperHint, _lowerHint);

        emit RefinancingFeePaid(_borrower, fee);
        // solhint-disable-next-line not-rely-on-time
        emit TroveUpdated(
            _borrower,
            newPrincipal,
            newInterest,
            newColl,
            vars.troveManagerCached.updateStakeAndTotalStakes(_borrower),
            vars.newRate,
            block.timestamp,
            uint8(BorrowerOperation.refinanceTrove)
        );
    }

    // --- Helper Functions ---

    function _triggerBorrowingFee(
        IMUSD _musd,
        uint256 _amount
    ) internal returns (uint) {
        uint256 fee = getBorrowingFee(_amount);
        _musd.mint(pcvAddress, fee);
        return fee;
    }

    function _withdrawMUSD(
        IActivePoolERC20 _activePool,
        IMUSD _musd,
        address _account,
        uint256 _debtAmount,
        uint256 _netDebtIncrease
    ) internal {
        _activePool.increaseDebt(_netDebtIncrease, 0);
        _musd.mint(_account, _debtAmount);
    }

    function _repayMUSD(
        IActivePoolERC20 _activePool,
        IMUSD _musd,
        address _account,
        uint256 _principal,
        uint256 _interest
    ) internal {
        _activePool.decreaseDebt(_principal, _interest);
        _musd.burn(_account, _principal + _interest);
    }

    function _moveTokensAndCollateralfromAdjustment(
        IActivePoolERC20 _activePool,
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

        // Note: For ERC20, collateral increase was already handled by transferFrom
        // in the public function. For decrease, we send collateral out.
        if (!_isCollIncrease && _collChange > 0) {
            _activePool.sendCollateral(_recipient, _collChange);
        }
    }

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

    function _getCollChange(
        uint256 _collReceived,
        uint256 _requestedCollWithdrawal
    ) internal pure returns (uint256 collChange, bool isCollIncrease) {
        if (_collReceived != 0) {
            collChange = _collReceived;
            isCollIncrease = true;
        } else {
            collChange = _requestedCollWithdrawal;
            isCollIncrease = false;
        }
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

    // --- Validation Functions ---

    function _requireTroveisNotActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        ITroveManager.Status status = _troveManager.getTroveStatus(_borrower);
        require(
            status != ITroveManager.Status.active,
            "BorrowerOpsERC20: Trove is active"
        );
    }

    function _requireTroveisActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        ITroveManager.Status status = _troveManager.getTroveStatus(_borrower);
        require(
            status == ITroveManager.Status.active,
            "BorrowerOpsERC20: Trove does not exist or is closed"
        );
    }

    function _requireNotInRecoveryMode(uint256 _price) internal view {
        require(
            !_checkRecoveryMode(_price),
            "BorrowerOpsERC20: Operation not permitted during Recovery Mode"
        );
    }

    function _requireNonZeroDebtChange(uint256 _debtChange) internal pure {
        require(
            _debtChange > 0,
            "BorrowerOpsERC20: Debt increase requires non-zero debtChange"
        );
    }

    function _requireSingularCollChange(
        uint256 _collWithdrawal,
        uint256 _collDeposit
    ) internal pure {
        require(
            _collWithdrawal == 0 || _collDeposit == 0,
            "BorrowerOpsERC20: Cannot withdraw and add coll"
        );
    }

    function _requireNonZeroAdjustment(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        uint256 _collDeposit
    ) internal pure {
        require(
            _collWithdrawal != 0 || _debtChange != 0 || _collDeposit != 0,
            "BorrowerOpsERC20: There must be either a collateral or debt change"
        );
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

    function _requireValidAdjustmentInNormalMode(
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        _requireICRisAboveMCR(_vars.newICR);
        uint256 newTCR = _getNewTCRFromTroveChange(
            _vars.collChange,
            _vars.isCollIncrease,
            _vars.netDebtChange,
            _isDebtIncrease,
            _vars.price
        );
        _requireNewTCRisAboveCCR(newTCR);
    }

    function _requireValidAdjustmentInRecoveryMode(
        uint256 _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        require(
            _collWithdrawal == 0,
            "BorrowerOpsERC20: Collateral withdrawal not permitted in Recovery Mode"
        );
        if (_isDebtIncrease) {
            _requireICRisAboveCCR(_vars.newICR);
        }
        require(
            _vars.newICR >= _vars.oldICR,
            "BorrowerOpsERC20: Cannot decrease your Trove's ICR in Recovery Mode"
        );
    }

    function _requireHasBorrowingCapacity(
        LocalVariables_adjustTrove memory _vars
    ) internal pure {
        require(
            _vars.debt + _vars.netDebtChange <= _vars.maxBorrowingCapacity,
            "BorrowerOpsERC20: Exceeds max borrowing capacity"
        );
    }

    function _requireValidMUSDRepayment(
        uint256 _currentDebt,
        uint256 _debtRepayment
    ) internal pure {
        require(
            _debtRepayment <= _currentDebt - MUSD_GAS_COMPENSATION,
            "BorrowerOpsERC20: Amount repaid must not be larger than the Trove's debt"
        );
    }

    function _requireSufficientMUSDBalance(
        address _account,
        uint256 _amount
    ) internal view {
        require(
            musd.balanceOf(_account) >= _amount,
            "BorrowerOpsERC20: Caller doesnt have enough MUSD"
        );
    }

    function _requireAtLeastMinNetDebt(uint256 _netDebt) internal view {
        require(
            _netDebt >= minNetDebt,
            "BorrowerOpsERC20: Trove's net debt must be greater than minimum"
        );
    }

    function _requireICRisAboveMCR(uint256 _newICR) internal pure {
        require(
            _newICR >= MCR,
            "BorrowerOpsERC20: An operation that would result in ICR < MCR is not permitted"
        );
    }

    function _requireICRisAboveCCR(uint256 _newICR) internal pure {
        require(
            _newICR >= CCR,
            "BorrowerOpsERC20: Operation must leave trove with ICR >= CCR"
        );
    }

    function _requireNewTCRisAboveCCR(uint256 _newTCR) internal pure {
        require(
            _newTCR >= CCR,
            "BorrowerOpsERC20: An operation that would result in TCR < CCR is not permitted"
        );
    }

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
}

