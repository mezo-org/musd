// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/LiquityBaseERC20.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/IBorrowerOperationsERC20.sol";
import "../token/IMUSD.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/erc20/IStabilityPoolERC20.sol";
import "../interfaces/ITroveManager.sol";

/**
 * @title StabilityPoolERC20
 * @notice Stability Pool for ERC20 collateral-backed mUSD system
 * @dev The Stability Pool holds mUSD tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, some of its debt gets offset with mUSD in the Stability Pool:
 * that is, the offset debt evaporates, and an equal amount of mUSD tokens in the Stability Pool are burned.
 *
 * Thus, a liquidation causes each depositor to receive a mUSD loss in proportion to their deposit
 * as a share of total deposits. They also receive an ERC20 collateral gain, as the collateral of the
 * liquidated trove is distributed among Stability depositors in the same proportion.
 *
 * This version is adapted from the native collateral StabilityPool to support ERC20 tokens as collateral.
 */
contract StabilityPoolERC20 is
    CheckContract,
    IStabilityPoolERC20,
    LiquityBaseERC20,
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

    /// @notice The ERC20 token used as collateral
    IERC20 public override collateralToken;

    IBorrowerOperationsERC20 public borrowerOperations;
    IMUSD public musd;
    ISortedTroves public sortedTroves;
    ITroveManager public troveManager;

    // Tracker for mUSD held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
    uint256 internal totalMUSDDeposits;
    // Deposited ERC20 collateral tracker
    uint256 internal collateral;
    // depositor address -> initial deposit value
    mapping(address => uint256) public deposits;
    // depositor address -> snapshots struct
    mapping(address => Snapshots) public depositSnapshots;

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
    mapping(uint128 => mapping(uint128 => uint256)) public epochToScaleToSum;

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

    /**
     * @notice Receive ERC20 collateral from ActivePool during liquidation
     * @dev Only callable by ActivePool. Replaces native receive() function.
     * @param _amount The amount of collateral to receive
     */
    function receiveCollateral(uint256 _amount) external override {
        _requireCallerIsActivePool();
        _receiveCollateralERC20(collateralToken, msg.sender, _amount);
        collateral += _amount;
        emit StabilityPoolCollateralBalanceUpdated(collateral);
        emit CollateralReceived(msg.sender, _amount);
    }

    // --- External ---

    /**
     * @notice Set all contract addresses during deployment
     * @dev Callable only by owner, renounces ownership at the end
     */
    function setAddresses(
        address _collateralTokenAddress,
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _musdTokenAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external override onlyOwner {
        checkContract(_collateralTokenAddress);
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_musdTokenAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_troveManagerAddress);

        collateralToken = IERC20(_collateralTokenAddress);
        activePool = IActivePoolERC20(_activePoolAddress);
        borrowerOperations = IBorrowerOperationsERC20(_borrowerOperationsAddress);
        musd = IMUSD(_musdTokenAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        troveManager = ITroveManager(_troveManagerAddress);

        emit CollateralTokenAddressChanged(_collateralTokenAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    /**
     * @notice Provide mUSD to the Stability Pool
     * @dev Sends depositor's accumulated gains (collateral) to depositor
     * @param _amount The amount of mUSD to deposit (must be non-zero)
     */
    function provideToSP(uint256 _amount) external override {
        _requireNonZeroAmount(_amount);

        uint256 initialDeposit = deposits[msg.sender];

        uint256 depositorCollateralGain = getDepositorCollateralGain(
            msg.sender
        );
        uint256 compoundedMUSDDeposit = getCompoundedMUSDDeposit(msg.sender);
        uint256 mUSDLoss = initialDeposit - compoundedMUSDDeposit; // Needed only for event log

        uint256 newDeposit = compoundedMUSDDeposit + _amount;

        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit CollateralGainWithdrawn(
            msg.sender,
            depositorCollateralGain,
            mUSDLoss
        ); // mUSD Loss required for event log

        _sendMUSDtoStabilityPool(msg.sender, _amount);

        _sendCollateralGainToDepositor(depositorCollateralGain);
    }

    /**
     * @notice Withdraw mUSD from the Stability Pool
     * @dev Sends all depositor's accumulated gains (collateral) to depositor.
     *      If _amount > userDeposit, the user withdraws all of their compounded deposit.
     * @param _amount The amount of mUSD to withdraw
     */
    function withdrawFromSP(uint256 _amount) external override {
        if (_amount != 0) {
            _requireNoUnderCollateralizedTroves();
        }
        uint256 initialDeposit = deposits[msg.sender];
        _requireUserHasDeposit(initialDeposit);

        uint256 depositorCollateralGain = getDepositorCollateralGain(
            msg.sender
        );

        uint256 compoundedMUSDDeposit = getCompoundedMUSDDeposit(msg.sender);
        uint256 mUSDtoWithdraw = LiquityMath._min(
            _amount,
            compoundedMUSDDeposit
        );
        uint256 mUSDLoss = initialDeposit - compoundedMUSDDeposit; // Needed only for event log

        _sendMUSDToDepositor(msg.sender, mUSDtoWithdraw);

        // Update deposit
        uint256 newDeposit = compoundedMUSDDeposit - mUSDtoWithdraw;
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit CollateralGainWithdrawn(
            msg.sender,
            depositorCollateralGain,
            mUSDLoss
        ); // mUSD Loss required for event log

        _sendCollateralGainToDepositor(depositorCollateralGain);
    }

    /**
     * @notice Transfer the depositor's entire collateral gain from the Stability Pool to their trove
     * @dev Leaves their compounded deposit in the Stability Pool and updates snapshots.
     *      For ERC20, this requires approval of collateral to BorrowerOperations.
     * @param _upperHint Upper hint for trove list position
     * @param _lowerHint Lower hint for trove list position
     */
    function withdrawCollateralGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external override {
        uint256 initialDeposit = deposits[msg.sender];
        _requireUserHasDeposit(initialDeposit);
        _requireUserHasTrove(msg.sender);
        _requireUserHasCollateralGain(msg.sender);

        uint256 depositorCollateralGain = getDepositorCollateralGain(
            msg.sender
        );

        uint256 compoundedMUSDDeposit = getCompoundedMUSDDeposit(msg.sender);
        uint256 mUSDLoss = initialDeposit - compoundedMUSDDeposit; // Needed only for event log

        _updateDepositAndSnapshots(msg.sender, compoundedMUSDDeposit);

        /* Emit events before transferring collateral gain to Trove.
              This lets the event log make more sense (i.e. so it appears that first the collateral gain is withdrawn
             and then it is deposited into the Trove, not the other way around). */
        emit CollateralGainWithdrawn(
            msg.sender,
            depositorCollateralGain,
            mUSDLoss
        );
        emit UserDepositChanged(msg.sender, compoundedMUSDDeposit);

        collateral -= depositorCollateralGain;
        emit StabilityPoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(msg.sender, depositorCollateralGain);

        // For ERC20: Approve BorrowerOperations to transfer collateral, then call moveCollateralGainToTrove
        // BorrowerOperationsERC20 will pull the collateral using transferFrom
        collateralToken.safeIncreaseAllowance(
            address(borrowerOperations),
            depositorCollateralGain
        );

        // Call the ERC20 version which accepts the collateral amount parameter
        borrowerOperations.moveCollateralGainToTrove(
            msg.sender,
            depositorCollateralGain,
            _upperHint,
            _lowerHint
        );
    }

    /**
     * @notice Cancel out debt against mUSD in the Stability Pool and receive liquidated collateral
     * @dev Only callable by TroveManager during liquidations
     * @param _principalToOffset The principal debt to offset
     * @param _interestToOffset The interest debt to offset
     * @param _collToAdd The collateral to add to the pool
     */
    function offset(
        uint256 _principalToOffset,
        uint256 _interestToOffset,
        uint256 _collToAdd
    ) external override {
        _requireCallerIsTroveManager();
        uint256 totalMUSD = totalMUSDDeposits; // cached to save an SLOAD
        uint256 debtToOffset = _principalToOffset + _interestToOffset;
        if (totalMUSD == 0 || debtToOffset == 0) {
            return;
        }

        (
            uint256 collateralGainPerUnitStaked,
            uint256 mUSDLossPerUnitStaked
        ) = _computeRewardsPerUnitStaked(_collToAdd, debtToOffset, totalMUSD);

        _updateRewardSumAndProduct(
            collateralGainPerUnitStaked,
            mUSDLossPerUnitStaked
        ); // updates S and P

        _moveOffsetCollAndDebt(
            _collToAdd,
            _principalToOffset,
            _interestToOffset
        );
    }

    // --- Getters for public variables. Required by IStabilityPoolERC20 interface ---

    /**
     * @notice Returns the total amount of ERC20 collateral held by the pool
     */
    function getCollateralBalance() external view override returns (uint256) {
        return collateral;
    }

    /**
     * @notice Returns the total mUSD held in the pool
     */
    function getTotalMUSDDeposits() external view override returns (uint256) {
        return totalMUSDDeposits;
    }

    // -- Public ---

    /**
     * @notice Calculates the collateral gain earned by the deposit since its last snapshots were taken
     * @dev Given by the formula: E = d0 * (S - S(0))/P(0)
     *      where S(0) and P(0) are the depositor's snapshots of the sum S and product P, respectively.
     *      d0 is the last recorded deposit value.
     * @param _depositor The address of the depositor
     * @return The amount of collateral gained
     */
    function getDepositorCollateralGain(
        address _depositor
    ) public view override returns (uint256) {
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

    /**
     * @notice Return the user's compounded deposit
     * @dev Given by the formula: d = d0 * P/P(0)
     *      where P(0) is the depositor's snapshot of the product P, taken when they last updated their deposit.
     * @param _depositor The address of the depositor
     * @return The compounded mUSD deposit
     */
    function getCompoundedMUSDDeposit(
        address _depositor
    ) public view override returns (uint256) {
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
        if (_withdrawal == 0) {
            return;
        }

        // slither-disable-next-line unchecked-transfer
        musd.transfer(_depositor, _withdrawal);
        _decreaseMUSD(_withdrawal);
    }

    // Transfer the mUSD tokens from the user to the Stability Pool's address,
    // and update its recorded mUSD
    function _sendMUSDtoStabilityPool(
        address _address,
        uint256 _amount
    ) internal {
        uint256 newTotalMUSDDeposits = totalMUSDDeposits + _amount;
        totalMUSDDeposits = newTotalMUSDDeposits;

        emit StabilityPoolMUSDBalanceUpdated(newTotalMUSDDeposits);

        bool transferSuccess = musd.transferFrom(
            _address,
            address(this),
            _amount
        );
        require(transferSuccess, "MUSD was not transferred successfully.");
    }

    function _updateDepositAndSnapshots(
        address _depositor,
        uint256 _newValue
    ) internal {
        deposits[_depositor] = _newValue;

        if (_newValue == 0) {
            delete depositSnapshots[_depositor];
            emit DepositSnapshotUpdated(_depositor, 0, 0);
            return;
        }
        uint128 currentScaleCached = currentScale;
        uint128 currentEpochCached = currentEpoch;
        uint256 currentP = P;

        // Get S for the current epoch and current scale
        uint256 currentS = epochToScaleToSum[currentEpochCached][
            currentScaleCached
        ];

        // Record new snapshots of the latest running product P and sum S for the depositor
        depositSnapshots[_depositor].P = currentP;
        depositSnapshots[_depositor].S = currentS;
        depositSnapshots[_depositor].scale = currentScaleCached;
        depositSnapshots[_depositor].epoch = currentEpochCached;

        emit DepositSnapshotUpdated(_depositor, currentP, currentS);
    }

    /**
     * @notice Send collateral gain to depositor using ERC20 transfer
     * @param _amount The amount of collateral to send
     */
    function _sendCollateralGainToDepositor(uint256 _amount) internal {
        if (_amount == 0) {
            return;
        }
        uint256 newCollateral = collateral - _amount;
        collateral = newCollateral;
        emit StabilityPoolCollateralBalanceUpdated(newCollateral);
        emit CollateralSent(msg.sender, _amount);

        _sendCollateralERC20(collateralToken, msg.sender, _amount);
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
        /*
         * Compute the mUSD and collateral rewards. Uses a "feedback" error correction, to keep
         * the cumulative error in the P and S state variables low:
         *
         * 1) Form numerators which compensate for the floor division errors that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
         * 4) Store these errors for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint256 collateralNumerator = _collToAdd *
            DECIMAL_PRECISION +
            lastCollateralError_Offset;

        assert(_debtToOffset <= _totalMUSDDeposits);
        if (_debtToOffset == _totalMUSDDeposits) {
            mUSDLossPerUnitStaked = DECIMAL_PRECISION; // When the Pool depletes to 0, so does each deposit
            lastMUSDLossError_Offset = 0;
        } else {
            uint256 mUSDLossNumerator = _debtToOffset *
                DECIMAL_PRECISION -
                lastMUSDLossError_Offset;
            /*
             * Add 1 to make error in quotient positive. We want "slightly too much" mUSD loss,
             * which ensures the error in any given compoundedMUSDDeposit favors the Stability Pool.
             */
            mUSDLossPerUnitStaked = mUSDLossNumerator / _totalMUSDDeposits + 1;
            lastMUSDLossError_Offset =
                mUSDLossPerUnitStaked *
                _totalMUSDDeposits -
                mUSDLossNumerator;
        }

        collateralGainPerUnitStaked = collateralNumerator / _totalMUSDDeposits;
        // slither-disable-next-line divide-before-multiply
        lastCollateralError_Offset =
            collateralNumerator -
            (collateralGainPerUnitStaked * _totalMUSDDeposits);

        return (collateralGainPerUnitStaked, mUSDLossPerUnitStaked);
    }

    function _moveOffsetCollAndDebt(
        uint256 _collToAdd,
        uint256 _principalToOffset,
        uint256 _interestToOffset
    ) internal {
        IActivePoolERC20 activePoolCached = activePool;

        uint256 debtToOffset = _principalToOffset + _interestToOffset;
        // Cancel the liquidated debt with the mUSD in the stability pool
        activePoolCached.decreaseDebt(_principalToOffset, _interestToOffset);
        _decreaseMUSD(debtToOffset);

        // Burn the debt that was successfully offset
        musd.burn(address(this), debtToOffset);

        // For ERC20: ActivePool sends collateral via transferFrom
        // The collateral has already been received via receiveCollateral() called by ActivePool.sendCollateral()
        activePoolCached.sendCollateral(address(this), _collToAdd);
    }

    function _decreaseMUSD(uint256 _amount) internal {
        uint256 newTotalMUSDDeposits = totalMUSDDeposits - _amount;
        totalMUSDDeposits = newTotalMUSDDeposits;
        emit StabilityPoolMUSDBalanceUpdated(newTotalMUSDDeposits);
    }

    // Update the Stability Pool reward sum S and product P

    // slither-disable-start dead-code
    function _updateRewardSumAndProduct(
        uint256 _collateralGainPerUnitStaked,
        uint256 _mUSDLossPerUnitStaked
    ) internal {
        uint256 currentP = P;
        uint256 newP;

        assert(_mUSDLossPerUnitStaked <= DECIMAL_PRECISION);
        /*
         * The newProductFactor is the factor by which to change all deposits, due to the depletion of Stability Pool mUSD in the liquidation.
         * We make the product factor 0 if there was a pool-emptying. Otherwise, it is (1 - MUSDLossPerUnitStaked)
         */
        uint256 newProductFactor = DECIMAL_PRECISION - _mUSDLossPerUnitStaked;

        uint128 currentScaleCached = currentScale;
        uint128 currentEpochCached = currentEpoch;
        uint256 currentS = epochToScaleToSum[currentEpochCached][
            currentScaleCached
        ];

        /*
         * Calculate the new S first, before we update P.
         * The collateral gain for any given depositor from a liquidation depends on the value of their deposit
         * (and the value of totalDeposits) prior to the Stability being depleted by the debt in the liquidation.
         *
         * Since S corresponds to collateral gain, and P to deposit loss, we update S first.
         */
        uint256 marginalCollateralGain = _collateralGainPerUnitStaked *
            currentP;
        uint256 newS = currentS + marginalCollateralGain;
        epochToScaleToSum[currentEpochCached][currentScaleCached] = newS;
        emit SUpdated(newS, currentEpochCached, currentScaleCached);

        uint256 PBeforeScaleChanges = (currentP * newProductFactor) /
            DECIMAL_PRECISION;

        if (newProductFactor == 0) {
            // If the Stability Pool was emptied, increment the epoch, and reset
            // the scale and product P
            currentEpoch = currentEpochCached + 1;
            emit EpochUpdated(currentEpoch);
            currentScale = 0;
            emit ScaleUpdated(currentScale);
            newP = DECIMAL_PRECISION;
        } else if (PBeforeScaleChanges == 1) {
            // If multiplying P by the product factor results in exactly one, we
            // need to increment the scale twice.
            newP =
                (currentP * newProductFactor * SCALE_FACTOR * SCALE_FACTOR) /
                DECIMAL_PRECISION;
            currentScale = currentScaleCached + 2;
            emit ScaleUpdated(currentScale);
        } else if (PBeforeScaleChanges < SCALE_FACTOR) {
            // If multiplying P by a non-zero product factor would reduce P below
            // the scale boundary, increment the scale
            newP =
                (currentP * newProductFactor * SCALE_FACTOR) /
                DECIMAL_PRECISION;
            currentScale = currentScaleCached + 1;
            emit ScaleUpdated(currentScale);
        } else {
            newP = PBeforeScaleChanges;
        }

        assert(newP > 0);
        P = newP;

        emit PUpdated(newP);
    }

    function _requireNoUnderCollateralizedTroves() internal view {
        uint256 price = priceFeed.fetchPrice();
        address lowestTrove = sortedTroves.getLast();
        uint256 ICR = troveManager.getCurrentICR(lowestTrove, price);
        require(
            ICR >= MCR,
            "StabilityPool: Cannot withdraw while there are troves with ICR < MCR"
        );
    }

    // Used to calculate compounded deposits.
    function _getCompoundedStakeFromSnapshots(
        uint256 initialStake,
        Snapshots memory snapshots
    ) internal view returns (uint256) {
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
    ) internal view returns (uint256) {
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
            "StabilityPool: Caller is not ActivePool"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == address(troveManager),
            "StabilityPool: Caller is not TroveManager"
        );
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) ==
                ITroveManager.Status.active,
            "StabilityPool: caller must have an active trove to withdraw collateralGain to"
        );
    }

    function _requireUserHasCollateralGain(address _depositor) internal view {
        uint256 collateralGain = getDepositorCollateralGain(_depositor);
        require(
            collateralGain > 0,
            "StabilityPool: caller must have non-zero collateral Gain"
        );
    }

    function _requireUserHasDeposit(uint256 _initialDeposit) internal pure {
        require(
            _initialDeposit > 0,
            "StabilityPool: User must have a non-zero deposit"
        );
    }

    function _requireNonZeroAmount(uint256 _amount) internal pure {
        require(_amount > 0, "StabilityPool: Amount must be non-zero");
    }
}

// slither-disable-end dead-code
// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
