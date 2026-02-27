// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/BaseMath.sol";
import "../dependencies/InterestRateMath.sol";
import "../dependencies/LiquityMath.sol";
import "../interfaces/IBorrowerOperations.sol";
import "../interfaces/IGasPool.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/erc20/IActivePoolERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";
import "../interfaces/erc20/IDefaultPoolERC20.sol";
import "../interfaces/erc20/IStabilityPoolERC20.sol";
import "../interfaces/erc20/ITroveManagerERC20.sol";
import "../token/IMUSD.sol";

/**
 * @title TroveManagerERC20
 * @notice Handles liquidations, redemptions, and trove state management with ERC20 collateral.
 *
 * This is a simplified implementation focusing on core trove state management functions
 * used by BorrowerOperations. Full liquidation and redemption logic can be expanded later.
 *
 * Key differences from native TroveManager:
 * - References ERC20 pool contracts instead of native ones
 * - sendCollateral patterns use approve+receiveCollateral pattern for pool transfers
 * - collateralToken address stored for token interactions
 */
contract TroveManagerERC20 is
    BaseMath,
    CheckContract,
    ITroveManagerERC20,
    OwnableUpgradeable
{
    enum TroveManagerOperation {
        applyPendingRewards,
        liquidate,
        redeemCollateral
    }

    // Store the necessary data for a trove
    struct Trove {
        uint256 coll;
        uint256 principal;
        uint256 interestOwed;
        uint256 stake;
        Status status;
        uint16 interestRate;
        uint256 lastInterestUpdateTime;
        uint256 maxBorrowingCapacity;
        uint128 arrayIndex;
    }

    // Object containing the collateral and mUSD snapshots for a given active trove
    struct RewardSnapshot {
        uint256 collateral;
        uint256 principal;
        uint256 interest;
    }

    // --- Constants ---

    // Minimum collateral ratio for individual troves
    uint256 public constant MCR = 1.1e18; // 110%

    // Critical system collateral ratio. If TCR falls below CCR, Recovery Mode is triggered.
    uint256 public constant CCR = 1.5e18; // 150%

    // Amount of mUSD to be locked in gas pool on opening troves
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;

    uint256 public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    // --- Connected contract declarations ---

    IActivePoolERC20 public activePool;
    IBorrowerOperations public borrowerOperations;
    ICollSurplusPoolERC20 public collSurplusPool;
    IDefaultPoolERC20 public defaultPool;
    address public gasPoolAddress;
    IInterestRateManager public interestRateManager;
    IMUSD public musdToken;
    address public pcvAddress;
    address public priceFeedAddress;
    ISortedTroves public sortedTroves;
    IStabilityPoolERC20 public override stabilityPool;

    IERC20 public collateralToken;

    // --- Data structures ---

    mapping(address => Trove) public Troves;

    uint256 public totalStakes;

    // Snapshot of the value of totalStakes, taken immediately after the latest liquidation
    uint256 public totalStakesSnapshot;

    // Snapshot of the total collateral across the ActivePool and DefaultPool, immediately after the latest liquidation.
    uint256 public totalCollateralSnapshot;

    /*
     * L_Collateral, L_Principal, and L_Interest track the sums of accumulated
     * pending liquidations per unit staked.
     */
    uint256 public L_Collateral;
    uint256 public L_Principal;
    uint256 public L_Interest;

    // Array of all active trove addresses
    // slither-disable-next-line similar-names
    address[] public TroveOwners;

    // Error trackers for the trove redistribution calculation
    uint256 public lastCollateralError_Redistribution;
    uint256 public lastPrincipalError_Redistribution;
    uint256 public lastInterestError_Redistribution;

    // Map addresses with active troves to their RewardSnapshot
    mapping(address => RewardSnapshot) public rewardSnapshots;

    // --- Errors ---

    error CollateralTransferFailed();

    // --- Functions ---

    function initialize(address _collateralToken) external initializer {
        require(_collateralToken != address(0), "Invalid collateral token");
        __Ownable_init(msg.sender);
        collateralToken = IERC20(_collateralToken);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
        address _interestRateManagerAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _stabilityPoolAddress
    ) external override onlyOwner {
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_stabilityPoolAddress);

        // slither-disable-start missing-zero-check
        activePool = IActivePoolERC20(_activePoolAddress);
        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        collSurplusPool = ICollSurplusPoolERC20(_collSurplusPoolAddress);
        defaultPool = IDefaultPoolERC20(_defaultPoolAddress);
        gasPoolAddress = _gasPoolAddress;
        interestRateManager = IInterestRateManager(_interestRateManagerAddress);
        musdToken = IMUSD(_musdTokenAddress);
        pcvAddress = _pcvAddress;
        priceFeedAddress = _priceFeedAddress;
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        stabilityPool = IStabilityPoolERC20(_stabilityPoolAddress);
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit InterestRateManagerAddressChanged(_interestRateManagerAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PCVAddressChanged(_pcvAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);

        renounceOwnership();
    }

    // --- Trove property setters, called by BorrowerOperations ---

    function setTroveStatus(
        address _borrower,
        Status _status
    ) external override {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].status = _status;
    }

    function increaseTroveColl(
        address _borrower,
        uint256 _collIncrease
    ) external override returns (uint256) {
        _requireCallerIsBorrowerOperations();
        uint256 newColl = Troves[_borrower].coll + _collIncrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function decreaseTroveColl(
        address _borrower,
        uint256 _collDecrease
    ) external override returns (uint256) {
        _requireCallerIsBorrowerOperations();
        uint256 newColl = Troves[_borrower].coll - _collDecrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function setTroveMaxBorrowingCapacity(
        address _borrower,
        uint256 _maxBorrowingCapacity
    ) external override {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].maxBorrowingCapacity = _maxBorrowingCapacity;
    }

    function increaseTroveDebt(
        address _borrower,
        uint256 _debtIncrease
    ) external override returns (uint256) {
        _requireCallerIsBorrowerOperations();
        interestRateManager.addPrincipal(
            _debtIncrease,
            Troves[_borrower].interestRate
        );
        uint256 newDebt = Troves[_borrower].principal + _debtIncrease;
        Troves[_borrower].principal = newDebt;
        return newDebt;
    }

    function decreaseTroveDebt(
        address _borrower,
        uint256 _debtDecrease
    ) external override returns (uint256, uint256) {
        _requireCallerIsBorrowerOperations();
        _updateTroveDebt(_borrower, _debtDecrease);
        return (Troves[_borrower].principal, Troves[_borrower].interestOwed);
    }

    function setTroveInterestRate(
        address _borrower,
        uint16 _rate
    ) external override {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].interestRate = _rate;
    }

    function setTroveLastInterestUpdateTime(
        address _borrower,
        uint256 _timestamp
    ) external override {
        _requireCallerIsBorrowerOperations();
        Troves[_borrower].lastInterestUpdateTime = _timestamp;
    }

    function updateStakeAndTotalStakes(
        address _borrower
    ) external override returns (uint256) {
        _requireCallerIsBorrowerOperations();
        return _updateStakeAndTotalStakes(_borrower);
    }

    function updateTroveRewardSnapshots(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _updateTroveRewardSnapshots(_borrower);
    }

    function addTroveOwnerToArray(
        address _borrower
    ) external override returns (uint256 index) {
        _requireCallerIsBorrowerOperations();
        return _addTroveOwnerToArray(_borrower);
    }

    function closeTrove(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _closeTrove(_borrower, Status.closedByOwner);
    }

    function removeStake(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _removeStake(_borrower);
    }

    // --- Liquidation functions (stubbed for now) ---

    function liquidate(address _borrower) external override {
        _requireTroveIsActive(_borrower);

        address[] memory borrowers = new address[](1);
        borrowers[0] = _borrower;
        batchLiquidateTroves(borrowers);
    }

    // --- Getters (external view) ---

    function getTroveOwnersCount() external view override returns (uint256) {
        return TroveOwners.length;
    }

    function getTroveFromTroveOwnersArray(
        uint256 _index
    ) external view override returns (address) {
        return TroveOwners[_index];
    }

    function getNominalICR(
        address _borrower
    ) external view override returns (uint256) {
        (uint256 pendingPrincipal, ) = getPendingDebt(_borrower);

        uint256 collateral = Troves[_borrower].coll +
            getPendingCollateral(_borrower);

        uint256 principal = Troves[_borrower].principal + pendingPrincipal;

        return LiquityMath._computeNominalCR(collateral, principal);
    }

    function getTroveStatus(
        address _borrower
    ) external view override returns (Status) {
        return Troves[_borrower].status;
    }

    function getTroveStake(
        address _borrower
    ) external view override returns (uint256) {
        return Troves[_borrower].stake;
    }

    function getTroveDebt(
        address _borrower
    ) external view override returns (uint256) {
        return _getTotalDebt(_borrower);
    }

    function getTrovePrincipal(
        address _borrower
    ) external view override returns (uint256) {
        return Troves[_borrower].principal;
    }

    function getTroveInterestRate(
        address _borrower
    ) external view override returns (uint16) {
        return Troves[_borrower].interestRate;
    }

    function getTroveLastInterestUpdateTime(
        address _borrower
    ) external view override returns (uint256) {
        return Troves[_borrower].lastInterestUpdateTime;
    }

    function getTroveInterestOwed(
        address _borrower
    ) external view override returns (uint256) {
        return Troves[_borrower].interestOwed;
    }

    function getTroveColl(
        address _borrower
    ) external view override returns (uint256) {
        return Troves[_borrower].coll;
    }

    function getTCR(uint256 _price) external view override returns (uint256) {
        return _getTCR(_price);
    }

    function getTroveMaxBorrowingCapacity(
        address _borrower
    ) external view override returns (uint256) {
        return Troves[_borrower].maxBorrowingCapacity;
    }

    function checkRecoveryMode(
        uint256 _price
    ) external view override returns (bool) {
        return _checkRecoveryMode(_price);
    }

    // --- External pure functions ---

    function redeemCollateral(
        uint256 /* _amount */,
        address /* _firstRedemptionHint */,
        address /* _upperPartialRedemptionHint */,
        address /* _lowerPartialRedemptionHint */,
        uint256 /* _partialRedemptionHintNICR */,
        uint256 /* _maxIterations */
    ) external pure override {
        // TODO: Implement full redemption logic for ERC20 collateral
        // For now, this is a stub that will be expanded later
        revert("TroveManager: Redemption not yet implemented for ERC20");
    }

    // --- Public functions (non-view) ---

    function updateSystemAndTroveInterest(address _borrower) public override {
        updateSystemInterest();
        _updateTroveInterest(_borrower);
    }

    function updateSystemInterest() public override {
        // slither-disable-next-line calls-loop
        interestRateManager.updateSystemInterest();
    }

    function batchLiquidateTroves(
        address[] memory _troveArray
    ) public override {
        require(
            _troveArray.length != 0,
            "TroveManager: Calldata address array must not be empty"
        );

        // TODO: Implement full liquidation logic for ERC20 collateral
        // For now, this is a stub that will be expanded later
        revert("TroveManager: Liquidation not yet implemented for ERC20");
    }

    // --- Public view functions ---

    function getCurrentICR(
        address _borrower,
        uint256 _price
    ) public view override returns (uint256) {
        (
            uint256 currentCollateral,
            uint256 currentDebt
        ) = _getCurrentTroveAmounts(_borrower);
        uint256 ICR = LiquityMath._computeCR(
            currentCollateral,
            currentDebt,
            _price
        );
        return ICR;
    }

    function hasPendingRewards(
        address _borrower
    ) public view override returns (bool) {
        if (Troves[_borrower].status != Status.active) {
            return false;
        }

        return (rewardSnapshots[_borrower].collateral < L_Collateral);
    }

    function getEntireDebtAndColl(
        address _borrower
    )
        public
        view
        override
        returns (
            uint256 coll,
            uint256 principal,
            uint256 interest,
            uint256 pendingCollateral,
            uint256 pendingPrincipal,
            uint256 pendingInterest
        )
    {
        Trove storage trove = Troves[_borrower];
        coll = trove.coll;
        principal = trove.principal;
        interest = trove.interestOwed;

        // solhint-disable not-rely-on-time
        interest += InterestRateMath.calculateInterestOwed(
            principal,
            trove.interestRate,
            trove.lastInterestUpdateTime,
            block.timestamp
        );
        // solhint-enable not-rely-on-time

        pendingCollateral = getPendingCollateral(_borrower);
        (pendingPrincipal, pendingInterest) = getPendingDebt(_borrower);

        coll += pendingCollateral;
        principal += pendingPrincipal;
        interest += pendingInterest;
    }

    function getPendingCollateral(
        address _borrower
    ) public view override returns (uint256) {
        uint256 snapshotCollateral = rewardSnapshots[_borrower].collateral;
        uint256 rewardPerUnitStaked = L_Collateral - snapshotCollateral;

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint256 stake = Troves[_borrower].stake;

        return (stake * rewardPerUnitStaked) / DECIMAL_PRECISION;
    }

    function getPendingDebt(
        address _borrower
    )
        public
        view
        override
        returns (uint256 pendingPrincipal, uint256 pendingInterest)
    {
        uint256 principalSnapshot = rewardSnapshots[_borrower].principal;
        uint256 principalPerUnitStaked = L_Principal - principalSnapshot;

        uint256 interestSnapshot = rewardSnapshots[_borrower].interest;
        uint256 interestPerUnitStaked = L_Interest - interestSnapshot;

        if (
            principalPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return (0, 0);
        }

        uint256 stake = Troves[_borrower].stake;

        pendingPrincipal = (stake * principalPerUnitStaked) / DECIMAL_PRECISION;
        pendingInterest = (stake * interestPerUnitStaked) / DECIMAL_PRECISION;
    }

    // --- Helper functions (public view) ---

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

    function _updateTroveDebt(address _borrower, uint256 _payment) internal {
        Trove storage trove = Troves[_borrower];

        // slither-disable-start calls-loop
        (
            uint256 principalAdjustment,
            uint256 interestAdjustment
        ) = interestRateManager.updateTroveDebt(
                trove.interestOwed,
                _payment,
                trove.interestRate
            );
        // slither-disable-end calls-loop
        trove.principal -= principalAdjustment;
        trove.interestOwed -= interestAdjustment;
    }

    function _updateTroveInterest(address _borrower) internal {
        Trove storage trove = Troves[_borrower];

        // solhint-disable not-rely-on-time
        trove.interestOwed += InterestRateMath.calculateInterestOwed(
            trove.principal,
            trove.interestRate,
            trove.lastInterestUpdateTime,
            block.timestamp
        );
        trove.lastInterestUpdateTime = block.timestamp;
        // solhint-enable not-rely-on-time

        _applyPendingRewards(_borrower);
    }

    function _applyPendingRewards(address _borrower) internal {
        Trove storage trove = Troves[_borrower];
        if (hasPendingRewards(_borrower)) {
            uint256 pendingCollateral = getPendingCollateral(_borrower);
            (
                uint256 pendingPrincipal,
                uint256 pendingInterest
            ) = getPendingDebt(_borrower);

            trove.coll += pendingCollateral;
            trove.principal += pendingPrincipal;
            trove.interestOwed += pendingInterest;

            // slither-disable-start calls-loop
            interestRateManager.addPrincipal(
                pendingPrincipal,
                trove.interestRate
            );
            // slither-disable-end calls-loop

            _updateTroveRewardSnapshots(_borrower);

            _movePendingTroveRewardsToActivePool(
                pendingCollateral,
                pendingPrincipal,
                pendingInterest
            );

            emit TroveUpdated(
                _borrower,
                trove.principal,
                trove.interestOwed,
                trove.coll,
                trove.stake,
                trove.interestRate,
                trove.lastInterestUpdateTime,
                uint8(TroveManagerOperation.applyPendingRewards)
            );
        }
    }

    function _movePendingTroveRewardsToActivePool(
        uint256 _collateral,
        uint256 _principal,
        uint256 _interest
    ) internal {
        // slither-disable-next-line calls-loop
        defaultPool.decreaseDebt(_principal, _interest);
        // slither-disable-next-line calls-loop
        activePool.increaseDebt(_principal, _interest);
        // slither-disable-next-line calls-loop
        defaultPool.sendCollateralToActivePool(_collateral);
        // Active pool needs to receive the collateral
        // slither-disable-next-line calls-loop
        activePool.receiveCollateral(_collateral);
    }

    function _updateStakeAndTotalStakes(
        address _borrower
    ) internal returns (uint256) {
        uint256 newStake = _computeNewStake(Troves[_borrower].coll);
        uint256 oldStake = Troves[_borrower].stake;
        Troves[_borrower].stake = newStake;

        // slither-disable-next-line costly-loop
        totalStakes = totalStakes - oldStake + newStake;
        emit TotalStakesUpdated(totalStakes);

        return newStake;
    }

    function _updateTroveRewardSnapshots(address _borrower) internal {
        rewardSnapshots[_borrower].collateral = L_Collateral;
        rewardSnapshots[_borrower].principal = L_Principal;
        rewardSnapshots[_borrower].interest = L_Interest;
        emit TroveSnapshotsUpdated(L_Collateral, L_Principal, L_Interest);
    }

    function _addTroveOwnerToArray(
        address _borrower
    ) internal returns (uint128 index) {
        TroveOwners.push(_borrower);

        index = uint128(TroveOwners.length - 1);
        Troves[_borrower].arrayIndex = index;

        return index;
    }

    function _removeStake(address _borrower) internal {
        uint256 stake = Troves[_borrower].stake;
        // slither-disable-next-line costly-loop
        totalStakes -= stake;
        Troves[_borrower].stake = 0;
    }

    function _closeTrove(address _borrower, Status closedStatus) internal {
        assert(
            closedStatus != Status.nonExistent && closedStatus != Status.active
        );

        uint256 TroveOwnersArrayLength = TroveOwners.length;
        // slither-disable-next-line calls-loop
        if (musdToken.mintList(address(borrowerOperations))) {
            _requireMoreThanOneTroveInSystem(TroveOwnersArrayLength);
        }

        // slither-disable-start calls-loop
        interestRateManager.removePrincipal(
            Troves[_borrower].principal,
            Troves[_borrower].interestRate
        );
        // slither-disable-end calls-loop

        Troves[_borrower].status = closedStatus;
        Troves[_borrower].coll = 0;
        Troves[_borrower].principal = 0;
        Troves[_borrower].interestOwed = 0;

        rewardSnapshots[_borrower].collateral = 0;
        rewardSnapshots[_borrower].principal = 0;
        rewardSnapshots[_borrower].interest = 0;

        _removeTroveOwner(_borrower, TroveOwnersArrayLength);
        // slither-disable-next-line calls-loop
        sortedTroves.remove(_borrower);
    }

    function _removeTroveOwner(
        address _borrower,
        uint256 TroveOwnersArrayLength
    ) internal {
        Status troveStatus = Troves[_borrower].status;
        assert(
            troveStatus != Status.nonExistent && troveStatus != Status.active
        );

        uint128 index = Troves[_borrower].arrayIndex;
        uint256 length = TroveOwnersArrayLength;
        uint256 idxLast = length - 1;

        assert(index <= idxLast);

        address addressToMove = TroveOwners[idxLast];

        TroveOwners[index] = addressToMove;
        Troves[addressToMove].arrayIndex = index;
        emit TroveIndexUpdated(addressToMove, index);

        // slither-disable-next-line costly-loop
        TroveOwners.pop();
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

    function _getCurrentTroveAmounts(
        address _borrower
    ) internal view returns (uint256 currentCollateral, uint256 currentDebt) {
        uint256 pendingCollateral = getPendingCollateral(_borrower);
        (uint256 pendingPrincipal, uint256 pendingInterest) = getPendingDebt(
            _borrower
        );

        currentCollateral = Troves[_borrower].coll + pendingCollateral;
        currentDebt =
            _getTotalDebt(_borrower) +
            pendingPrincipal +
            pendingInterest;
    }

    function _getTotalDebt(address _borrower) internal view returns (uint256) {
        // slither-disable-start calls-loop
        // solhint-disable not-rely-on-time
        return
            Troves[_borrower].principal +
            Troves[_borrower].interestOwed +
            InterestRateMath.calculateInterestOwed(
                Troves[_borrower].principal,
                Troves[_borrower].interestRate,
                Troves[_borrower].lastInterestUpdateTime,
                block.timestamp
            );
        // solhint-enable not-rely-on-time
        // slither-disable-end calls-loop
    }

    function _computeNewStake(uint256 _coll) internal view returns (uint256) {
        uint256 stake;
        if (totalCollateralSnapshot == 0) {
            stake = _coll;
        } else {
            assert(totalStakesSnapshot > 0);
            stake = (_coll * totalStakesSnapshot) / totalCollateralSnapshot;
        }
        return stake;
    }

    // --- Access control functions (internal view) ---

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == address(borrowerOperations),
            "TroveManager: Caller is not the BorrowerOperations contract"
        );
    }

    function _requireTroveIsActive(address _borrower) internal view {
        require(
            Troves[_borrower].status == Status.active,
            "TroveManager: Trove does not exist or is closed"
        );
    }

    function _requireMoreThanOneTroveInSystem(
        uint256 TroveOwnersArrayLength
    ) internal view {
        // slither-disable-next-line calls-loop
        require(
            TroveOwnersArrayLength > 1 && sortedTroves.getSize() > 1,
            "TroveManager: Only one trove in the system"
        );
    }

    // --- Internal pure functions ---

    function _getCollGasCompensation(
        uint256 _entireColl
    ) internal pure returns (uint256) {
        return _entireColl / PERCENT_DIVISOR;
    }
}
// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
