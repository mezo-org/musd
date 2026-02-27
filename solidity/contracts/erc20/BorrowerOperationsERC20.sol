// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/BaseMath.sol";
import "../dependencies/InterestRateMath.sol";
import "../dependencies/LiquityMath.sol";
import "../interfaces/IGovernableVariables.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";
import "../interfaces/erc20/IBorrowerOperationsERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";
import "../interfaces/erc20/IDefaultPoolERC20.sol";
import "../interfaces/erc20/IPCVERC20.sol";
import "../interfaces/erc20/ITroveManagerERC20.sol";
import "../token/IMUSD.sol";

/**
 * @title BorrowerOperationsERC20
 * @notice Main user interface for trove management with ERC20 collateral
 *
 * Users can:
 * - Open troves with ERC20 collateral
 * - Add/remove collateral
 * - Borrow/repay mUSD
 * - Close troves
 *
 * Key differences from native BorrowerOperations:
 * - Collateral is pulled via approve+transferFrom pattern (no msg.value)
 * - References ERC20 pool contracts instead of native ones
 * - openTrove, addColl, adjustTrove take explicit collateral amounts
 */
contract BorrowerOperationsERC20 is
    BaseMath,
    CheckContract,
    IBorrowerOperationsERC20,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
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

    struct ContractsCache {
        ITroveManagerERC20 troveManager;
        IActivePoolERC20 activePool;
        IMUSD musd;
        IInterestRateManager interestRateManager;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove
    }

    // --- Constants ---

    string public constant NAME = "BorrowerOperationsERC20";
    uint256 public constant MIN_NET_DEBT_MIN = 50e18;

    // Minimum collateral ratio for individual troves
    uint256 public constant MCR = 1.1e18; // 110%

    // Critical system collateral ratio. If TCR falls below CCR, Recovery Mode is triggered.
    uint256 public constant CCR = 1.5e18; // 150%

    // Amount of mUSD to be locked in gas pool on opening troves
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;

    // --- Connected contract declarations ---

    IActivePoolERC20 public activePool;
    ICollSurplusPoolERC20 public collSurplusPool;
    IDefaultPoolERC20 public defaultPool;
    address public gasPoolAddress;
    IGovernableVariables public governableVariables;
    IInterestRateManager public interestRateManager;
    IMUSD public musd;
    IPCVERC20 public pcv;
    address public pcvAddress;
    IPriceFeed public priceFeed;
    ISortedTroves public sortedTroves;
    address public stabilityPoolAddress;
    ITroveManagerERC20 public troveManager;

    IERC20 public collateralToken;

    // Governable Variables

    // Minimum amount of net mUSD debt a trove must have
    uint256 public minNetDebt;

    // Borrowing Rate
    uint256 public borrowingRate; // expressed as a percentage in 1e18 precision

    // --- Errors ---

    error CollateralTransferFailed();

    // --- Modifiers ---

    modifier onlyPCV() {
        require(msg.sender == pcvAddress, "BorrowerOps: Caller is not PCV");
        _;
    }

    // --- Functions ---

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _collateralToken) external initializer {
        require(_collateralToken != address(0), "Invalid collateral token");
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();

        collateralToken = IERC20(_collateralToken);
        minNetDebt = 1800e18;
        borrowingRate = DECIMAL_PRECISION / 1000; // 0.1%
    }

    function setAddresses(
        address _activePoolAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
        address _governableVariablesAddress,
        address _interestRateManagerAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        // This makes impossible to open a trove with zero withdrawn mUSD
        assert(minNetDebt > 0);

        checkContract(_activePoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_governableVariablesAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_troveManagerAddress);

        // slither-disable-start missing-zero-check
        activePool = IActivePoolERC20(_activePoolAddress);
        collSurplusPool = ICollSurplusPoolERC20(_collSurplusPoolAddress);
        defaultPool = IDefaultPoolERC20(_defaultPoolAddress);
        gasPoolAddress = _gasPoolAddress;
        governableVariables = IGovernableVariables(_governableVariablesAddress);
        interestRateManager = IInterestRateManager(_interestRateManagerAddress);
        musd = IMUSD(_musdTokenAddress);
        pcv = IPCVERC20(_pcvAddress);
        pcvAddress = _pcvAddress;
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        stabilityPoolAddress = _stabilityPoolAddress;
        troveManager = ITroveManagerERC20(_troveManagerAddress);
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit GovernableVariablesAddressChanged(_governableVariablesAddress);
        emit InterestRateManagerAddressChanged(_interestRateManagerAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PCVAddressChanged(_pcvAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    // --- PCV functions ---

    function mintBootstrapLoanFromPCV(
        uint256 _musdToMint
    ) external override onlyPCV {
        musd.mint(pcvAddress, _musdToMint);
    }

    function burnDebtFromPCV(uint256 _musdToBurn) external override onlyPCV {
        musd.burn(pcvAddress, _musdToBurn);
    }

    // --- Borrower Trove Operations ---

    function openTrove(
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external override nonReentrant {
        _openTrove(
            msg.sender,
            msg.sender,
            _collAmount,
            _debtAmount,
            _upperHint,
            _lowerHint
        );
    }

    function addColl(
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override nonReentrant {
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

    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override nonReentrant {
        _requireCallerIsStabilityPool();
        _adjustTrove(
            _borrower,
            _borrower,
            msg.sender, // StabilityPool is the collateral source
            _collAmount,
            0,
            0,
            false,
            _upperHint,
            _lowerHint
        );
    }

    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override nonReentrant {
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

    function withdrawMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override nonReentrant {
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

    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override nonReentrant {
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

    function closeTrove() external override nonReentrant {
        _closeTrove(msg.sender, msg.sender, msg.sender);
    }

    function adjustTrove(
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external override nonReentrant {
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

    function claimCollateral() external override nonReentrant {
        _claimCollateral(msg.sender, msg.sender);
    }

    // --- View Functions ---

    function getBorrowingFee(
        uint256 _debt
    ) public view override returns (uint256) {
        return (_debt * borrowingRate) / DECIMAL_PRECISION;
    }

    function getEntireSystemColl()
        public
        view
        returns (uint256 entireSystemColl)
    {
        uint256 activeColl = activePool.getCollateralBalance();
        uint256 liquidatedColl = defaultPool.getCollateralBalance();
        return activeColl + liquidatedColl;
    }

    function getEntireSystemDebt()
        public
        view
        returns (uint256 entireSystemDebt)
    {
        uint256 activeDebt = activePool.getDebt();
        uint256 closedDebt = defaultPool.getDebt();
        return activeDebt + closedDebt;
    }

    // --- Internal functions ---

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
        _requireNonZeroCollAmount(_collAmount);

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
        uint256 compositeDebt = _getCompositeDebt(vars.netDebt);

        vars.ICR = LiquityMath._computeCR(
            _collAmount,
            compositeDebt,
            vars.price
        );
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
            ); // bools: coll increase, debt increase
            _requireNewTCRisAboveCCR(newTCR);
        }

        vars.interestRate = contractsCache.interestRateManager.interestRate();
        contractsCache.troveManager.setTroveInterestRate(
            _borrower,
            vars.interestRate
        );

        // Set the trove struct's properties
        contractsCache.troveManager.setTroveStatus(
            _borrower,
            ITroveManagerERC20.Status.active
        );
        // slither-disable-next-line unused-return
        contractsCache.troveManager.increaseTroveColl(_borrower, _collAmount);
        // slither-disable-next-line unused-return
        contractsCache.troveManager.increaseTroveDebt(_borrower, compositeDebt);

        // solhint-disable not-rely-on-time
        contractsCache.troveManager.setTroveLastInterestUpdateTime(
            _borrower,
            block.timestamp
        );
        // solhint-enable not-rely-on-time

        // Set trove's max borrowing capacity to the amount that would put it at 110% ICR
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

        // Pull collateral from user and send to ActivePool
        _pullCollateralAndSendToActivePool(msg.sender, _collAmount);

        // Mint mUSD to the recipient
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

        emit TroveCreated(_borrower, vars.arrayIndex);

        // solhint-disable not-rely-on-time
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
        // solhint-enable not-rely-on-time
        emit BorrowingFeePaid(_borrower, vars.fee);
    }

    function _adjustTrove(
        address _borrower,
        address _recipient,
        address _collateralSource,
        uint256 _collDeposit,
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
        _requireSingularCollChange(_collWithdrawal, _collDeposit);
        _requireNonZeroAdjustment(_collWithdrawal, _mUSDChange, _collDeposit);
        _requireTroveisActive(contractsCache.troveManager, _borrower);

        /*
         * Confirm the operation is either a borrower adjusting their own trove,
         * or a pure collateral transfer from the Stability Pool to a trove
         */
        assert(
            msg.sender == _borrower ||
                (msg.sender == stabilityPoolAddress &&
                    _collDeposit > 0 &&
                    _mUSDChange == 0)
        );

        // Get the collChange based on whether or not collateral was deposited or withdrawn
        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            _collDeposit,
            _collWithdrawal
        );

        vars.netDebtChange = _mUSDChange;

        // If the adjustment incorporates a principal increase and system is in Normal Mode, then trigger a borrowing fee
        if (_isDebtIncrease && !vars.isRecoveryMode) {
            vars.fee = governableVariables.isAccountFeeExempt(_borrower)
                ? 0
                : _triggerBorrowingFee(contractsCache.musd, _mUSDChange);
            vars.netDebtChange += vars.fee; // The raw debt change includes the fee
        }

        vars.debt = contractsCache.troveManager.getTroveDebt(_borrower);
        vars.coll = contractsCache.troveManager.getTroveColl(_borrower);
        vars.interestRate = contractsCache.troveManager.getTroveInterestRate(
            _borrower
        );

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
            _requireSufficientMUSDBalance(msg.sender, vars.netDebtChange);
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

        // solhint-disable not-rely-on-time
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
        // solhint-enable not-rely-on-time
        emit BorrowingFeePaid(_borrower, vars.fee);

        // Use the unmodified _mUSDChange here, as we don't send the fee to the user
        _moveTokensAndCollateralfromAdjustment(
            contractsCache.activePool,
            contractsCache.musd,
            _collateralSource,
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
        ITroveManagerERC20 troveManagerCached = troveManager;
        troveManagerCached.updateSystemAndTroveInterest(_borrower);

        IActivePoolERC20 activePoolCached = activePool;
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

        // Decrease the active pool debt by the principal (subtracting interestOwed from the total debt)
        activePoolCached.decreaseDebt(
            debt - MUSD_GAS_COMPENSATION - interestOwed,
            interestOwed
        );

        // Burn the repaid mUSD from the caller's balance
        musdTokenCached.burn(_caller, debt - MUSD_GAS_COMPENSATION);

        // Burn the gas compensation from the gas pool
        _repayMUSD(
            activePoolCached,
            musdTokenCached,
            gasPoolAddress,
            MUSD_GAS_COMPENSATION,
            0
        );

        // Send the collateral back to the recipient
        activePoolCached.sendCollateral(_recipient, coll);
    }

    function _claimCollateral(address _borrower, address _recipient) internal {
        troveManager.updateSystemInterest();

        // Send collateral from CollSurplus Pool to recipient
        collSurplusPool.claimColl(_borrower, _recipient);
    }

    // --- Helper functions ---

    function _triggerBorrowingFee(
        IMUSD _musd,
        uint256 _amount
    ) internal returns (uint256) {
        uint256 fee = getBorrowingFee(_amount);

        // Send fee to PCV contract
        _musd.mint(pcvAddress, fee);
        return fee;
    }

    // Issue the specified amount of mUSD to _account and increases the total active debt
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

    // Burn the specified amount of MUSD from _account and decreases the total active debt
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
        address _collateralSource,
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
                msg.sender,
                _principalChange,
                _interestChange
            );
        }

        if (_isCollIncrease) {
            _pullCollateralAndSendToActivePool(_collateralSource, _collChange);
        } else {
            _activePool.sendCollateral(_recipient, _collChange);
        }
    }

    // Pull collateral from caller and send to Active Pool
    function _pullCollateralAndSendToActivePool(
        address _from,
        uint256 _amount
    ) internal {
        if (_amount == 0) return;

        // Pull collateral from _from to this contract
        bool pullSuccess = collateralToken.transferFrom(
            _from,
            address(this),
            _amount
        );
        if (!pullSuccess) revert CollateralTransferFailed();

        // Approve ActivePool to pull from us
        collateralToken.approve(address(activePool), _amount);

        // Send to ActivePool via receiveCollateral
        activePool.receiveCollateral(_amount);
    }

    // Update trove's coll and debt based on whether they increase or decrease
    function _updateTroveFromAdjustment(
        ITroveManagerERC20 _troveManager,
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

    function _getNewTCRFromTroveChange(
        uint256 _collChange,
        bool _isCollIncrease,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _price
    ) internal view returns (uint256) {
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

    function _getTCR(uint256 _price) internal view returns (uint256 TCR) {
        uint256 entireSystemColl = getEntireSystemColl();
        uint256 entireSystemDebt = getEntireSystemDebt();
        TCR = LiquityMath._computeCR(
            entireSystemColl,
            entireSystemDebt,
            _price
        );
        return TCR;
    }

    function _checkRecoveryMode(uint256 _price) internal view returns (bool) {
        uint256 TCR = _getTCR(_price);
        return TCR < CCR;
    }

    // --- Requirement functions (internal view) ---

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "BorrowerOps: Caller is not Stability Pool"
        );
    }

    function _requireNotInRecoveryMode(uint256 _price) internal view {
        require(
            !_checkRecoveryMode(_price),
            "BorrowerOps: Operation not permitted during Recovery Mode"
        );
    }

    function _requireTroveisNotActive(
        ITroveManagerERC20 _troveManager,
        address _borrower
    ) internal view {
        ITroveManagerERC20.Status status = _troveManager.getTroveStatus(
            _borrower
        );
        require(
            status != ITroveManagerERC20.Status.active,
            "BorrowerOps: Trove is active"
        );
    }

    function _requireTroveisActive(
        ITroveManagerERC20 _troveManager,
        address _borrower
    ) internal view {
        ITroveManagerERC20.Status status = _troveManager.getTroveStatus(
            _borrower
        );

        require(
            status == ITroveManagerERC20.Status.active,
            "BorrowerOps: Trove does not exist or is closed"
        );
    }

    function _requireAtLeastMinNetDebt(uint256 _netDebt) internal view {
        require(
            _netDebt >= minNetDebt,
            "BorrowerOps: Trove's net debt must be greater than minimum"
        );
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

    // --- Requirement functions (internal pure) ---

    function _requireNonZeroCollAmount(uint256 _collAmount) internal pure {
        require(
            _collAmount > 0,
            "BorrowerOps: Collateral amount must be greater than 0"
        );
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

    function _requireValidMUSDRepayment(
        uint256 _currentDebt,
        uint256 _debtRepayment
    ) internal pure {
        require(
            _debtRepayment <= _currentDebt - MUSD_GAS_COMPENSATION,
            "BorrowerOps: Amount repaid must not be larger than the Trove's debt"
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
        uint256 _collDeposit
    ) internal pure {
        require(
            _collDeposit == 0 || _collWithdrawal == 0,
            "BorrowerOperations: Cannot withdraw and add coll"
        );
    }

    function _requireNonZeroAdjustment(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        uint256 _collDeposit
    ) internal pure {
        require(
            _collDeposit != 0 || _collWithdrawal != 0 || _debtChange != 0,
            "BorrowerOps: There must be either a collateral change or a debt change"
        );
    }

    function _requireHasBorrowingCapacity(
        LocalVariables_adjustTrove memory _vars
    ) internal pure {
        require(
            _vars.maxBorrowingCapacity >= _vars.netDebtChange + _vars.debt,
            "BorrowerOps: An operation that exceeds maxBorrowingCapacity is not permitted"
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

    // --- Pure helper functions ---

    function _getCollChange(
        uint256 _collDeposit,
        uint256 _collWithdrawal
    ) internal pure returns (uint256 collChange, bool isCollIncrease) {
        if (_collDeposit != 0) {
            collChange = _collDeposit;
            isCollIncrease = true;
        } else {
            collChange = _collWithdrawal;
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
    ) internal pure returns (uint256) {
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
    ) internal pure returns (uint256 newColl, uint256 newDebt) {
        newColl = _isCollIncrease ? _coll + _collChange : _coll - _collChange;
        newDebt = _isDebtIncrease ? _debt + _debtChange : _debt - _debtChange;
    }

    function _calculateMaxBorrowingCapacity(
        uint256 _coll,
        uint256 _price
    ) internal pure returns (uint256) {
        return (_coll * _price) / (110 * 1e16);
    }

    // Returns the composite debt (drawn debt + gas compensation) of a trove
    function _getCompositeDebt(uint256 _debt) internal pure returns (uint256) {
        return _debt + MUSD_GAS_COMPENSATION;
    }

    function _getNetDebt(uint256 _debt) internal pure returns (uint256) {
        return _debt - MUSD_GAS_COMPENSATION;
    }
}

// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
