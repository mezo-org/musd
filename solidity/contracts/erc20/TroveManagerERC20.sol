// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

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
import "../interfaces/erc20/IDefaultPoolERC20.sol";
import "../interfaces/erc20/ICollSurplusPoolERC20.sol";
import "../interfaces/IGasPool.sol";
import "../interfaces/IInterestRateManager.sol";
import "../interfaces/IPCV.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/IStabilityPool.sol";
import "../interfaces/ITroveManager.sol";
import "../token/IMUSD.sol";

/**
 * @title TroveManagerERC20
 * @notice Manages troves with ERC20 collateral - handles liquidations, redemptions, and trove state
 * @dev This is a skeleton implementation demonstrating the ERC20 pattern.
 *      Key differences from native version:
 *      - Uses ERC20 pool interfaces (IActivePoolERC20, IDefaultPoolERC20, ICollSurplusPoolERC20)
 *      - Uses IBorrowerOperationsERC20 interface
 *      - Adds collateralToken address state variable
 *      - Updated setAddresses to accept collateralToken parameter
 *
 *      Full implementation requires:
 *      - Complete internal liquidation logic
 *      - Complete internal redemption logic
 *      - All helper functions from original TroveManager
 *      - Proper integration with ERC20 pool contracts
 *      - Comprehensive testing
 */
contract TroveManagerERC20 is
    CheckContract,
    ITroveManager,
    LiquityBase,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

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

    struct LocalVariables_OuterLiquidationFunction {
        uint256 price;
        uint256 mUSDInStabPool;
        uint256 liquidatedColl;
    }

    struct LocalVariables_redeemCollateralFromTrove {
        uint256 newDebt;
        uint256 newColl;
        uint256 newPrincipal;
        uint256 interestPayment;
        uint256 upperBoundNICR;
        uint256 newNICR;
        uint256 mUSDLot;
    }

    struct LocalVariables_InnerSingleLiquidateFunction {
        uint256 collToLiquidate;
        uint256 pendingColl;
        uint256 pendingPrincipal;
        uint256 pendingInterest;
    }

    struct LiquidationTotals {
        uint256 totalCollInSequence;
        uint256 totalPrincipalInSequence;
        uint256 totalInterestInSequence;
        uint256 totalCollGasCompensation;
        uint256 totalMUSDGasCompensation;
        uint256 totalPrincipalToOffset;
        uint256 totalInterestToOffset;
        uint256 totalCollToSendToSP;
        uint256 totalPrincipalToRedistribute;
        uint256 totalInterestToRedistribute;
        uint256 totalCollToRedistribute;
    }

    struct LocalVariables_LiquidationSequence {
        uint256 remainingMUSDInStabPool;
        uint256 i;
        uint256 ICR;
        address user;
        uint256 entireSystemDebt;
        uint256 entireSystemColl;
    }

    struct LocalVariables_redeemCollateral {
        uint256 minNetDebt;
        uint16 interestRate;
    }

    struct LiquidationValues {
        uint256 entireTrovePrincipal;
        uint256 entireTroveInterest;
        uint256 entireTroveColl;
        uint256 collGasCompensation;
        uint256 mUSDGasCompensation;
        uint256 principalToOffset;
        uint256 interestToOffset;
        uint256 collToSendToSP;
        uint256 principalToRedistribute;
        uint256 interestToRedistribute;
        uint256 collToRedistribute;
        uint256 collSurplus;
    }

    struct ContractsCache {
        IActivePoolERC20 activePool;
        IDefaultPoolERC20 defaultPool;
        IMUSD musdToken;
        IPCV pcv;
        ISortedTroves sortedTroves;
        ICollSurplusPoolERC20 collSurplusPool;
        address gasPoolAddress;
    }

    struct SingleRedemptionValues {
        uint256 principal;
        uint256 interest;
        uint256 collateralLot;
        bool cancelledPartial;
    }

    struct RedemptionTotals {
        uint256 remainingMUSD;
        uint256 totalPrincipalToRedeem;
        uint256 totalInterestToRedeem;
        uint256 totalCollateralDrawn;
        uint256 collateralFee;
        uint256 collateralToSendToRedeemer;
        uint256 price;
        uint256 totalDebtAtStart;
    }

    // --- Connected contract declarations ---

    address public collateralToken;
    IBorrowerOperationsERC20 public borrowerOperations;
    ICollSurplusPoolERC20 public collSurplusPool;
    address public gasPoolAddress;
    IMUSD public musdToken;
    IPCV public override pcv;
    // A doubly linked list of Troves, sorted by their sorted by their collateral ratios
    ISortedTroves public sortedTroves;
    IStabilityPool public override stabilityPool;

    // --- Data structures ---

    mapping(address => Trove) public Troves;

    uint256 public totalStakes;

    // Snapshot of the value of totalStakes, taken immediately after the latest liquidation
    uint256 public totalStakesSnapshot;

    // Snapshot of the total collateral across the ActivePool and DefaultPool, immediately after the latest liquidation.
    uint256 public totalCollateralSnapshot;

    /*
     * L_Collateral, L_Principal, and L_Interest track the sums of accumulated
     * pending liquidations per unit staked. During its lifetime, each stake
     * earns:
     *
     * An collateral gain of ( stake * [L_Collateral - L_Collateral(0)] )
     * A principal increase  of ( stake * [L_Principal - L_Principal(0)] )
     * An interest increase  of ( stake * [L_Interest - L_Interest(0)] )
     *
     * Where L_Collateral(0), L_Principal(0), and L_Interest(0) are snapshots of
     * L_Collateral, L_Principal, and L_Interest for the active Trove taken at the
     * instant the stake was made
     */
    uint256 public L_Collateral;
    uint256 public L_Principal;
    uint256 public L_Interest;

    // Array of all active trove addresses - used to to compute an approximate hint off-chain, for the sorted list insertion
    // slither-disable-next-line similar-names
    address[] public TroveOwners;

    // Error trackers for the trove redistribution calculation
    uint256 public lastCollateralError_Redistribution;
    uint256 public lastPrincipalError_Redistribution;
    uint256 public lastInterestError_Redistribution;

    // Map addresses with active troves to their RewardSnapshot
    mapping(address => RewardSnapshot) public rewardSnapshots;

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _collateralToken,
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
    ) external onlyOwner {
        checkContract(_collateralToken);
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
        collateralToken = _collateralToken;
        activePool = IActivePool(_activePoolAddress);
        borrowerOperations = IBorrowerOperationsERC20(_borrowerOperationsAddress);
        collSurplusPool = ICollSurplusPoolERC20(_collSurplusPoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        gasPoolAddress = _gasPoolAddress;
        interestRateManager = IInterestRateManager(_interestRateManagerAddress);
        musdToken = IMUSD(_musdTokenAddress);
        pcv = IPCV(_pcvAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        stabilityPool = IStabilityPool(_stabilityPoolAddress);
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

    // --- Overridden ITroveManager setAddresses for compatibility ---
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
        revert("TroveManagerERC20: Use setAddresses with collateralToken parameter");
    }

    function liquidate(address _borrower) external override {
        revert("TroveManagerERC20: not implemented");
    }

    function redeemCollateral(
        uint256 _amount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR,
        uint256 _maxIterations
    ) external override {
        revert("TroveManagerERC20: not implemented");
    }

    function updateStakeAndTotalStakes(
        address _borrower
    ) external override returns (uint) {
        revert("TroveManagerERC20: not implemented");
    }

    // Update borrower's snapshots of L_Collateral, L_Principal, and L_Interest
    // to reflect the current values
    function updateTroveRewardSnapshots(address _borrower) external override {
        revert("TroveManagerERC20: not implemented");
    }

    // Push the owner's address to the Trove owners list, and record the corresponding array index on the Trove struct
    function addTroveOwnerToArray(
        address _borrower
    ) external override returns (uint256 index) {
        revert("TroveManagerERC20: not implemented");
    }

    function closeTrove(address _borrower) external override {
        revert("TroveManagerERC20: not implemented");
    }

    function removeStake(address _borrower) external override {
        revert("TroveManagerERC20: not implemented");
    }

    // --- Trove property setters, called by BorrowerOperations ---

    function setTroveStatus(
        address _borrower,
        Status _status
    ) external override {
        revert("TroveManagerERC20: not implemented");
    }

    function increaseTroveColl(
        address _borrower,
        uint256 _collIncrease
    ) external override returns (uint) {
        revert("TroveManagerERC20: not implemented");
    }

    function decreaseTroveColl(
        address _borrower,
        uint256 _collDecrease
    ) external override returns (uint) {
        revert("TroveManagerERC20: not implemented");
    }

    function setTroveMaxBorrowingCapacity(
        address _borrower,
        uint256 _maxBorrowingCapacity
    ) external override {
        revert("TroveManagerERC20: not implemented");
    }

    function increaseTroveDebt(
        address _borrower,
        uint256 _debtIncrease
    ) external override returns (uint) {
        revert("TroveManagerERC20: not implemented");
    }

    function decreaseTroveDebt(
        address _borrower,
        uint256 _debtDecrease
    ) external override returns (uint256, uint256) {
        revert("TroveManagerERC20: not implemented");
    }

    function setTroveInterestRate(address _borrower, uint16 _rate) external {
        revert("TroveManagerERC20: not implemented");
    }

    function setTroveLastInterestUpdateTime(
        address _borrower,
        uint256 _timestamp
    ) external {
        revert("TroveManagerERC20: not implemented");
    }

    // --- View functions that read state (implemented) ---

    function getTroveOwnersCount() external view override returns (uint) {
        return TroveOwners.length;
    }

    function getTroveFromTroveOwnersArray(
        uint256 _index
    ) external view override returns (address) {
        return TroveOwners[_index];
    }

    function getNominalICR(
        address _borrower
    ) external view override returns (uint) {
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
    ) external view override returns (uint) {
        return Troves[_borrower].stake;
    }

    function getTroveDebt(
        address _borrower
    ) external view override returns (uint) {
        return _getTotalDebt(_borrower);
    }

    function getTrovePrincipal(address _borrower) external view returns (uint) {
        return Troves[_borrower].principal;
    }

    function getTroveInterestRate(
        address _borrower
    ) external view returns (uint16) {
        return Troves[_borrower].interestRate;
    }

    function getTroveLastInterestUpdateTime(
        address _borrower
    ) external view returns (uint) {
        return Troves[_borrower].lastInterestUpdateTime;
    }

    function getTroveInterestOwed(
        address _borrower
    ) external view returns (uint256) {
        return Troves[_borrower].interestOwed;
    }

    function getTroveColl(
        address _borrower
    ) external view override returns (uint) {
        return Troves[_borrower].coll;
    }

    function getTCR(uint256 _price) external view override returns (uint) {
        return _getTCR(_price);
    }

    function getTroveMaxBorrowingCapacity(
        address _borrower
    ) external view returns (uint256) {
        return Troves[_borrower].maxBorrowingCapacity;
    }

    function checkRecoveryMode(
        uint256 _price
    ) external view override returns (bool) {
        return _checkRecoveryMode(_price);
    }

    function updateSystemAndTroveInterest(address _borrower) public {
        revert("TroveManagerERC20: not implemented");
    }

    function updateSystemInterest() public {
        revert("TroveManagerERC20: not implemented");
    }

    /*
     * Attempt to liquidate a custom list of troves provided by the caller.
     */
    function batchLiquidateTroves(
        address[] memory _troveArray
    ) public override {
        revert("TroveManagerERC20: not implemented");
    }

    function getCurrentICR(
        address _borrower,
        uint256 _price
    ) public view override returns (uint) {
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
        /*
         * A Trove has pending rewards if its snapshot is less than the current rewards per-unit-staked sum:
         * this indicates that rewards have occured since the snapshot was made, and the user therefore has
         * pending rewards
         */
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
    ) public view override returns (uint) {
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

    // --- Internal helper functions (view) ---

    function _getCurrentTroveAmounts(
        address _borrower
    ) internal view returns (uint currentCollateral, uint currentDebt) {
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
}
// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
