// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/InterestRateMath.sol";
import "../dependencies/LiquityMath.sol";
import "../dependencies/BaseMath.sol";
import "../interfaces/erc20/IBorrowerOperationsERC20.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";
import "../interfaces/erc20/IDefaultPoolERC20.sol";
import "../interfaces/IGovernableVariables.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/IPCV.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/ITroveManager.sol";
import "../token/IMUSD.sol";

/// @title BorrowerOperationsERC20
/// @notice Main user interface for trove management with ERC20 collateral tokens
/// @dev Adapted from BorrowerOperations.sol to support ERC20 collateral instead of native tokens
contract BorrowerOperationsERC20 is
    CheckContract,
    IBorrowerOperationsERC20,
    BaseMath,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;

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
        IActivePoolERC20 activePool;
        IMUSD musd;
        IInterestRateManager interestRateManager;
    }

    enum BorrowerOperation {
        openTrove,
        closeTrove,
        adjustTrove,
        refinanceTrove
    }

    // --- Constants ---

    string public constant name = "BorrowerOperationsERC20";
    uint256 public constant MIN_NET_DEBT_MIN = 50e18;

    uint256 public constant _100pct = 1e18; // 1e18 == 100%

    // Minimum collateral ratio for individual troves
    uint256 public constant MCR = 1.1e18; // 110%

    // Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
    uint256 public constant CCR = 1.5e18; // 150%

    // Amount of mUSD to be locked in gas pool on opening troves
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;

    uint256 public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    // --- State Variables ---

    // ERC20 collateral token
    IERC20 public override collateralToken;

    // Connected contract declarations
    ITroveManager public troveManager;
    IActivePoolERC20 public activePool;
    IDefaultPoolERC20 public defaultPool;
    address public gasPoolAddress;
    IGovernableVariables public override governableVariables;
    address public pcvAddress;
    address public stabilityPoolAddress;
    address public borrowerOperationsSignaturesAddress;
    ICollSurplusPoolERC20 public collSurplusPool;
    IMUSD public musd;
    IPCV public pcv;
    IInterestRateManager public interestRateManager;
    IPriceFeed public priceFeed;

    // A doubly linked list of Troves, sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // refinancing fee is always a percentage of the borrowing (issuance) fee
    uint8 public refinancingFeePercentage;

    // Governable Variables

    // Minimum amount of net mUSD debt a trove must have
    uint256 public override minNetDebt;
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

    // --- Modifiers ---

    modifier onlyGovernance() {
        require(
            msg.sender == pcv.council() || msg.sender == pcv.treasury(),
            "BorrowerOps: Only governance can call this function"
        );
        _;
    }

    // --- Initializer ---

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

    // --- PCV Functions ---

    /// @notice Mint bootstrap loan tokens to PCV
    /// @param _musdToMint Amount of mUSD to mint
    function mintBootstrapLoanFromPCV(uint256 _musdToMint) external {
        require(
            msg.sender == pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        musd.mint(pcvAddress, _musdToMint);
    }

    /// @notice Burn debt from PCV
    /// @param _musdToBurn Amount of mUSD to burn
    function burnDebtFromPCV(uint256 _musdToBurn) external virtual {
        require(
            msg.sender == pcvAddress,
            "BorrowerOperations: caller must be PCV"
        );
        musd.burn(pcvAddress, _musdToBurn);
    }

    // --- Borrower Trove Operations ---

    /// @inheritdoc IBorrowerOperationsERC20
    function openTrove(
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _openTrove(
            msg.sender,
            msg.sender,
            _collAmount,
            _debtAmount,
            _upperHint,
            _lowerHint
        );
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function addColl(
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
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

    /// @inheritdoc IBorrowerOperationsERC20
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _requireCallerIsStabilityPool();
        _adjustTrove(
            _borrower,
            _borrower,
            _borrower,
            _collAmount,
            0,
            0,
            false,
            _upperHint,
            _lowerHint
        );
    }

    /// @inheritdoc IBorrowerOperationsERC20
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

    /// @inheritdoc IBorrowerOperationsERC20
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

    /// @inheritdoc IBorrowerOperationsERC20
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

    /// @inheritdoc IBorrowerOperationsERC20
    function closeTrove() external override {
        _closeTrove(msg.sender, msg.sender, msg.sender);
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function refinance(
        address _upperHint,
        address _lowerHint
    ) external override {
        _refinance(msg.sender, _upperHint, _lowerHint);
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function adjustTrove(
        uint256 _collDeposit,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external override {
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

    /// @inheritdoc IBorrowerOperationsERC20
    function claimCollateral() external override {
        _claimCollateral(msg.sender, msg.sender);
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function setAddresses(address[14] memory _addresses) external onlyOwner {
        // This makes impossible to open a trove with zero withdrawn mUSD
        assert(minNetDebt > 0);

        uint256 addressLength = _addresses.length;
        for (uint256 i = 0; i < addressLength; i++) {
            checkContract(_addresses[i]);
        }

        // slither-disable-start missing-zero-check
        activePool = IActivePoolERC20(_addresses[0]);
        borrowerOperationsSignaturesAddress = _addresses[1];
        collSurplusPool = ICollSurplusPoolERC20(_addresses[2]);
        collateralToken = IERC20(_addresses[3]);
        defaultPool = IDefaultPoolERC20(_addresses[4]);
        gasPoolAddress = _addresses[5];
        governableVariables = IGovernableVariables(_addresses[6]);
        interestRateManager = IInterestRateManager(_addresses[7]);
        musd = IMUSD(_addresses[8]);
        pcv = IPCV(_addresses[9]);
        pcvAddress = _addresses[9];
        priceFeed = IPriceFeed(_addresses[10]);
        sortedTroves = ISortedTroves(_addresses[11]);
        stabilityPoolAddress = _addresses[12];
        troveManager = ITroveManager(_addresses[13]);
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_addresses[0]);
        emit BorrowerOperationsSignaturesAddressChanged(_addresses[1]);
        emit CollSurplusPoolAddressChanged(_addresses[2]);
        emit CollateralTokenAddressChanged(_addresses[3]);
        emit DefaultPoolAddressChanged(_addresses[4]);
        emit GasPoolAddressChanged(_addresses[5]);
        emit GovernableVariablesAddressChanged(_addresses[6]);
        emit InterestRateManagerAddressChanged(_addresses[7]);
        emit MUSDTokenAddressChanged(_addresses[8]);
        emit PCVAddressChanged(_addresses[9]);
        emit PriceFeedAddressChanged(_addresses[10]);
        emit SortedTrovesAddressChanged(_addresses[11]);
        emit StabilityPoolAddressChanged(_addresses[12]);
        emit TroveManagerAddressChanged(_addresses[13]);

        renounceOwnership();
    }

    /// @inheritdoc IBorrowerOperationsERC20
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

    /// @inheritdoc IBorrowerOperationsERC20
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

    /// @inheritdoc IBorrowerOperationsERC20
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

    /// @inheritdoc IBorrowerOperationsERC20
    function proposeBorrowingRate(uint256 _fee) external onlyGovernance {
        require(_fee <= 1e18, "Origination Fee must be at most 100%.");
        proposedBorrowingRate = _fee;
        proposedBorrowingRateTime = block.timestamp;
        emit BorrowingRateProposed(
            proposedBorrowingRate,
            proposedBorrowingRateTime
        );
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function approveBorrowingRate() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= proposedBorrowingRateTime + 7 days,
            "Must wait at least 7 days before approving a change to Origination Fee"
        );
        borrowingRate = proposedBorrowingRate;
        emit BorrowingRateChanged(borrowingRate);
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function proposeRedemptionRate(uint256 _rate) external onlyGovernance {
        require(_rate <= 1e18, "Redemption Rate must be at most 100%.");
        proposedRedemptionRate = _rate;
        proposedRedemptionRateTime = block.timestamp;
        emit RedemptionRateProposed(
            proposedRedemptionRate,
            proposedRedemptionRateTime
        );
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function approveRedemptionRate() external onlyGovernance {
        // solhint-disable not-rely-on-time
        require(
            block.timestamp >= proposedRedemptionRateTime + 7 days,
            "Must wait at least 7 days before approving a change to Redemption Rate"
        );
        redemptionRate = proposedRedemptionRate;
        emit RedemptionRateChanged(redemptionRate);
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function restrictedClaimCollateral(
        address _borrower,
        address _recipient
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _claimCollateral(_borrower, _recipient);
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function restrictedOpenTrove(
        address _borrower,
        address _recipient,
        uint256 _collAmount,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _openTrove(
            _borrower,
            _recipient,
            _collAmount,
            _debtAmount,
            _upperHint,
            _lowerHint
        );
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function restrictedCloseTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _closeTrove(_borrower, _caller, _recipient);
    }

    /// @inheritdoc IBorrowerOperationsERC20
    function restrictedRefinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _refinance(_borrower, _upperHint, _lowerHint);
    }

    /// @inheritdoc IBorrowerOperationsERC20
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
    ) external {
        _requireCallerIsBorrowerOperationsSignatures();
        _adjustTrove(
            _borrower,
            _recipient,
            _caller,
            _collDeposit,
            _collWithdrawal,
            _mUSDChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint
        );
    }

    /// @inheritdoc IBorrowerOperationsERC20
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

    /// @inheritdoc IBorrowerOperationsERC20
    function getBorrowingFee(uint256 _debt) public view returns (uint256) {
        return (_debt * borrowingRate) / DECIMAL_PRECISION;
    }

    /// @notice Returns the total system collateral
    function getEntireSystemColl() public view returns (uint256) {
        uint256 activeColl = activePool.getCollateralBalance();
        uint256 liquidatedColl = defaultPool.getCollateralBalance();
        return activeColl + liquidatedColl;
    }

    /// @notice Returns the total system debt
    function getEntireSystemDebt() public view returns (uint256) {
        uint256 activeDebt = activePool.getDebt();
        uint256 closedDebt = defaultPool.getDebt();
        return activeDebt + closedDebt;
    }

    // --- Internal Functions ---

    /// @notice Transfer ERC20 collateral from sender to this contract, then to active pool
    /// @param _from Address to transfer from
    /// @param _amount Amount of collateral to transfer
    function _pullCollateral(address _from, uint256 _amount) internal {
        collateralToken.safeTransferFrom(_from, address(this), _amount);
    }

    /// @notice Send collateral from this contract to active pool
    /// @param _amount Amount of collateral to send
    function _activePoolAddColl(uint256 _amount) internal {
        // Approve and send to active pool
        collateralToken.safeIncreaseAllowance(address(activePool), _amount);
        activePool.receiveCollateral(_amount);
    }

    /// @notice Burn the specified amount of MUSD from _account and decrease the total active debt
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

        if (_isCollIncrease) {
            // Collateral already pulled from caller, send to active pool
            _activePoolAddColl(_collChange);
        } else {
            _activePool.sendCollateral(_recipient, _collChange);
        }
    }

    /// @notice Update trove's coll and debt based on whether they increase or decrease
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
    ) internal returns (uint256) {
        uint256 fee = getBorrowingFee(_amount);

        // Send fee to PCV contract
        _musd.mint(pcvAddress, fee);
        return fee;
    }

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

        // Calculate ICR using _collAmount instead of msg.value
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
            ITroveManager.Status.active
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

        /*
         * Pull collateral from the caller and send to the Active Pool
         * If the user has insufficient tokens or hasn't approved, the transfer will revert.
         */
        _pullCollateral(msg.sender, _collAmount);
        _activePoolAddColl(_collAmount);

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
        // slither-disable-end reentrancy-events
    }

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
         * Confirm the operation is either a borrower adjusting their own trove (either directly or through
         * a signature), or a pure collateral transfer from the Stability Pool to a trove
         */
        assert(
            msg.sender == _borrower ||
                (msg.sender == stabilityPoolAddress &&
                    _collDeposit > 0 &&
                    _mUSDChange == 0) ||
                msg.sender == borrowerOperationsSignaturesAddress
        );

        // Get the collChange based on whether collateral is being deposited or withdrawn
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
            _requireSufficientMUSDBalance(_caller, vars.netDebtChange);
        }

        // Pull collateral from caller if depositing
        if (vars.isCollIncrease && vars.collChange > 0) {
            _pullCollateral(msg.sender, vars.collChange);
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
        // slither-disable-next-line reentrancy-events
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

        // slither-disable-next-line reentrancy-events
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

        vars.troveManagerCached.setTroveInterestRate(_borrower, vars.newRate);

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
        // solhint-disable not-rely-on-time
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
        // solhint-enable not-rely-on-time
        // slither-disable-end reentrancy-events
    }

    /// @notice Issue the specified amount of mUSD to _account and increases the total active debt
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

    function _claimCollateral(address _borrower, address _recipient) internal {
        troveManager.updateSystemInterest();

        // send collateral from CollSurplus Pool to owner
        collSurplusPool.claimColl(_borrower, _recipient);
    }

    function _getTCR(uint256 _price) internal view returns (uint256) {
        uint256 entireSystemColl = getEntireSystemColl();
        uint256 entireSystemDebt = getEntireSystemDebt();
        return LiquityMath._computeCR(entireSystemColl, entireSystemDebt, _price);
    }

    function _checkRecoveryMode(uint256 _price) internal view returns (bool) {
        uint256 TCR = _getTCR(_price);
        return TCR < CCR;
    }

    // --- Requirement Functions (internal view) ---

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

    // --- Internal Pure Functions ---

    function _getCompositeDebt(uint256 _debt) internal pure returns (uint256) {
        return _debt + MUSD_GAS_COMPENSATION;
    }

    function _getNetDebt(uint256 _debt) internal pure returns (uint256) {
        return _debt - MUSD_GAS_COMPENSATION;
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
        uint256 _collDeposit,
        uint256 _requestedCollWithdrawal
    ) internal pure returns (uint256 collChange, bool isCollIncrease) {
        if (_collDeposit != 0) {
            collChange = _collDeposit;
            isCollIncrease = true;
        } else {
            collChange = _requestedCollWithdrawal;
        }
    }

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
            _vars.maxBorrowingCapacity >= _vars.netDebtChange + _vars.debt,
            "BorrowerOps: An operation that exceeds maxBorrowingCapacity is not permitted"
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
