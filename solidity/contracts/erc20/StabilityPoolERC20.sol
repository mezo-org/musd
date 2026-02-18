// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/LiquityBase.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/IBorrowerOperationsERC20.sol";
import "../token/IMUSD.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/erc20/IStabilityPoolERC20.sol";
import "../interfaces/ITroveManager.sol";

contract StabilityPoolERC20 is
    CheckContract,
    IStabilityPoolERC20,
    LiquityBase,
    OwnableUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IERC20;

    // --- Type Declarations ---
    struct Snapshots {
        uint256 S;
        uint256 P;
        uint128 scale;
        uint128 epoch;
    }

    // The Product 'P' is an ever-decreasing number, though it never reaches 0. In order to handle it
    // becoming smaller and smaller without losing precision, whenever it becomes too small (< 1e9),
    // we multiply it by SCALE_FACTOR and record how many times we've done this in `currentScale`.
    uint256 public constant SCALE_FACTOR = 1e9;

    // --- State ---

    address public collateralToken;
    IBorrowerOperationsERC20 public borrowerOperations;
    IMUSD public musd;
    ISortedTroves public sortedTroves;
    ITroveManager public troveManager;

    // Tracker for mUSD held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
    uint256 internal totalMUSDDeposits;
    uint256 internal collateral; // deposited collateral tracker
    mapping(address => uint256) public deposits; // depositor address -> initial value
    mapping(address => Snapshots) public depositSnapshots; // depositor address -> snapshots struct

    /*  Product 'P': Running product by which to multiply an initial deposit, in order to find the current compounded deposit,
     * after a series of liquidations have occurred, each of which cancel some mUSD debt with the deposit.
     *
     * During its lifetime, a deposit's value evolves from d_t to d_t * P / P_t , where P_t
     * is the snapshot of P taken at the instant the deposit was made. 18-digit decimal.
     */
    uint256 public P;

    // Each time the scale of P shifts by SCALE_FACTOR, the scale is incremented by 1
    uint128 public currentScale;

    // With each offset that fully empties the Pool, the epoch is incremented by 1
    uint128 public currentEpoch;

    /* collateral Gain sum 'S': During its lifetime, each deposit d_t earns an collateral gain of ( d_t * [S - S_t] )/P_t, where S_t
     * is the depositor's snapshot of S taken at the time t when the deposit was made.
     *
     * The 'S' sums are stored in a nested mapping (epoch => scale => sum):
     *
     * - The inner mapping records the sum S at different scales
     * - The outer mapping records the (scale => sum) mappings, for different epochs.
     */
    mapping(uint128 => mapping(uint128 => uint)) public epochToScaleToSum;

    // Error trackers for the error correction in the offset calculation
    uint256 public lastCollateralError_Offset;
    uint256 public lastMUSDLossError_Offset;

    // --- Functions --

    function initialize() external initializer {
        __Ownable_init(msg.sender);

        P = DECIMAL_PRECISION;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- External ---

    function setAddresses(
        address _collateralToken,
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _musdTokenAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        checkContract(_collateralToken);
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_musdTokenAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_troveManagerAddress);

        collateralToken = _collateralToken;
        activePool = IActivePool(_activePoolAddress);
        borrowerOperations = IBorrowerOperationsERC20(_borrowerOperationsAddress);
        musd = IMUSD(_musdTokenAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        troveManager = ITroveManager(_troveManagerAddress);

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    /*  provideToSP():
     *
     * - Sends depositor's accumulated gains (collateral) to depositor
     */
    function provideToSP(uint256 _amount) external override {
        revert("StabilityPoolERC20: not implemented");
    }

    /*  withdrawFromSP():
     *
     * - Sends all depositor's accumulated gains (collateral) to depositor
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
     */
    function withdrawFromSP(uint256 _amount) external override {
        revert("StabilityPoolERC20: not implemented");
    }

    /* withdrawCollateralGainToTrove:
     * - Transfers the depositor's entire collateral gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit */
    function withdrawCollateralGainToTrove(
        uint256 _collAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        revert("StabilityPoolERC20: not implemented");
    }

    /*
     * Cancels out the specified debt against the mUSD contained in the Stability Pool (as far as possible)
     * and transfers the Trove's collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(
        uint256 _principalToOffset,
        uint256 _interestToOffset,
        uint256 _collToAdd
    ) external override {
        revert("StabilityPoolERC20: not implemented");
    }

    // --- Getters for public variables. Required by IPool interface ---

    function getCollateralBalance() external view override returns (uint) {
        return collateral;
    }

    function getTotalMUSDDeposits() external view override returns (uint) {
        return totalMUSDDeposits;
    }

    // -- Public ---

    /* Calculates the collateral gain earned by the deposit since its last snapshots were taken.
     * Given by the formula:  E = d0 * (S - S(0))/P(0)
     * where S(0) and P(0) are the depositor's snapshots of the sum S and product P, respectively.
     * d0 is the last recorded deposit value.
     */
    function getDepositorCollateralGain(
        address _depositor
    ) public view override returns (uint) {
        uint256 initialDeposit = deposits[_depositor];

        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint256 collateralGain = _getCollateralGainFromSnapshots(
            initialDeposit,
            snapshots
        );
        return collateralGain;
    }

    // --- Compounded deposit ---

    /*
     * Return the user's compounded deposit. Given by the formula:  d = d0 * P/P(0)
     * where P(0) is the depositor's snapshot of the product P, taken when they last updated their deposit.
     */
    function getCompoundedMUSDDeposit(
        address _depositor
    ) public view override returns (uint) {
        uint256 initialDeposit = deposits[_depositor];
        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint256 compoundedDeposit = _getCompoundedStakeFromSnapshots(
            initialDeposit,
            snapshots
        );
        return compoundedDeposit;
    }

    // -- Internal ---

    function _sendMUSDToDepositor(
        address _depositor,
        uint256 _withdrawal
    ) internal {
        revert("StabilityPoolERC20: not implemented");
    }

    // Transfer the mUSD tokens from the user to the Stability Pool's address,
    // and update its recorded mUSD
    function _sendMUSDtoStabilityPool(
        address _address,
        uint256 _amount
    ) internal {
        revert("StabilityPoolERC20: not implemented");
    }

    function _updateDepositAndSnapshots(
        address _depositor,
        uint256 _newValue
    ) internal {
        revert("StabilityPoolERC20: not implemented");
    }

    function _sendCollateralGainToDepositor(uint256 _amount) internal {
        revert("StabilityPoolERC20: not implemented");
    }

    function _computeRewardsPerUnitStaked(
        uint256 _collToAdd,
        uint256 _debtToOffset,
        uint256 _totalMUSDDeposits
    )
        internal
        returns (
            uint256 collateralGainPerUnitStaked,
            uint256 mUSDLossPerUnitStaked
        )
    {
        revert("StabilityPoolERC20: not implemented");
    }

    function _moveOffsetCollAndDebt(
        uint256 _collToAdd,
        uint256 _principalToOffset,
        uint256 _interestToOffset
    ) internal {
        revert("StabilityPoolERC20: not implemented");
    }

    function _decreaseMUSD(uint256 _amount) internal {
        revert("StabilityPoolERC20: not implemented");
    }

    // Update the Stability Pool reward sum S and product P

    // slither-disable-start dead-code
    function _updateRewardSumAndProduct(
        uint256 _collateralGainPerUnitStaked,
        uint256 _mUSDLossPerUnitStaked
    ) internal {
        revert("StabilityPoolERC20: not implemented");
    }

    function _requireNoUnderCollateralizedTroves() internal view {
        revert("StabilityPoolERC20: not implemented");
    }

    // Used to calculcate compounded deposits.
    function _getCompoundedStakeFromSnapshots(
        uint256 initialStake,
        Snapshots memory snapshots
    ) internal view returns (uint) {
        uint256 snapshot_P = snapshots.P;
        uint128 scaleSnapshot = snapshots.scale;
        uint128 epochSnapshot = snapshots.epoch;

        // If stake was made before a pool-emptying event, then it has been fully cancelled with debt -- so, return 0
        if (epochSnapshot < currentEpoch) {
            return 0;
        }

        uint256 compoundedStake;
        uint128 scaleDiff = currentScale - scaleSnapshot;

        /* Compute the compounded stake. If a scale change in P was made during the stake's lifetime,
         * account for it. If more than one scale change was made, then the stake has decreased by a factor of
         * at least 1e-9 -- so return 0.
         */
        if (scaleDiff == 0) {
            compoundedStake = (initialStake * P) / snapshot_P;
        } else if (scaleDiff == 1) {
            compoundedStake = (initialStake * P) / snapshot_P / SCALE_FACTOR;
        } else {
            // if scaleDiff >= 2
            compoundedStake = 0;
        }

        /*
         * If compounded deposit is less than a billionth of the initial deposit, return 0.
         *
         * NOTE: originally, this line was in place to stop rounding errors making the deposit
         * too large. However, the error corrections should ensure the error in P "favors the Pool",
         * i.e. any given compounded deposit should be slightly less than its theoretical value.
         *
         * Thus it's unclear whether this line is still really needed.
         */
        if (compoundedStake < initialStake / 1e9) {
            return 0;
        }

        return compoundedStake;
    }

    function _getCollateralGainFromSnapshots(
        uint256 initialDeposit,
        Snapshots memory snapshots
    ) internal view returns (uint) {
        /*
         * Grab the sum 'S' from the epoch at which the stake was made. The collateral gain may span up to one scale change.
         * If it does, the second portion of the collateral gain is scaled by 1e9.
         * If the gain spans no scale change, the second portion will be 0.
         */
        uint128 epochSnapshot = snapshots.epoch;
        uint128 scaleSnapshot = snapshots.scale;
        uint256 S_Snapshot = snapshots.S;
        uint256 P_Snapshot = snapshots.P;

        uint256 firstPortion = epochToScaleToSum[epochSnapshot][scaleSnapshot] -
            S_Snapshot;
        uint256 secondPortion = epochToScaleToSum[epochSnapshot][
            scaleSnapshot + 1
        ] / SCALE_FACTOR;

        uint256 collateralGain = (initialDeposit *
            (firstPortion + secondPortion)) /
            P_Snapshot /
            DECIMAL_PRECISION;

        return collateralGain;
    }

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == address(activePool),
            "StabilityPoolERC20: Caller is not ActivePool"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == address(troveManager),
            "StabilityPoolERC20: Caller is not TroveManager"
        );
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) ==
                ITroveManager.Status.active,
            "StabilityPoolERC20: caller must have an active trove to withdraw collateralGain to"
        );
    }

    function _requireUserHasCollateralGain(address _depositor) internal view {
        uint256 collateralGain = getDepositorCollateralGain(_depositor);
        require(
            collateralGain > 0,
            "StabilityPoolERC20: caller must have non-zero collateral Gain"
        );
    }

    function _requireUserHasDeposit(uint256 _initialDeposit) internal pure {
        require(
            _initialDeposit > 0,
            "StabilityPoolERC20: User must have a non-zero deposit"
        );
    }

    function _requireNonZeroAmount(uint256 _amount) internal pure {
        require(_amount > 0, "StabilityPoolERC20: Amount must be non-zero");
    }
}

// slither-disable-end dead-code
// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
