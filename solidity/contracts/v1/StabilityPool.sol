// slither-disable-start reentrancy-benign
// slither-disable-start reentrancy-events
// slither-disable-start reentrancy-no-eth

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IBorrowerOperations.sol";
import "../token/IMUSD.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ITroveManager.sol";

contract StabilityPool is
    LiquityBase,
    Ownable,
    CheckContract,
    SendCollateral,
    IStabilityPool
{
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

    address public collateralAddress;
    IBorrowerOperations public borrowerOperations;
    ITroveManager public troveManager;
    IMUSD public musd;
    // Needed to check if there are pending liquidations
    ISortedTroves public sortedTroves;
    // Tracker for MUSD held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
    uint256 internal totalMUSDDeposits;
    uint256 internal collateral; // deposited collateral tracker
    mapping(address => uint256) public deposits; // depositor address -> initial value
    mapping(address => Snapshots) public depositSnapshots; // depositor address -> snapshots struct

    /*  Product 'P': Running product by which to multiply an initial deposit, in order to find the current compounded deposit,
     * after a series of liquidations have occurred, each of which cancel some MUSD debt with the deposit.
     *
     * During its lifetime, a deposit's value evolves from d_t to d_t * P / P_t , where P_t
     * is the snapshot of P taken at the instant the deposit was made. 18-digit decimal.
     */
    uint256 public P = DECIMAL_PRECISION;

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

    constructor() Ownable(msg.sender) {}

    receive() external payable {
        _requireCallerIsActivePool();
        collateral += msg.value;
        emit StabilityPoolCollateralBalanceUpdated(collateral);
    }

    // --- External ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _musdTokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _collateralAddress
    ) external override onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_musdTokenAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_priceFeedAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }

        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        musd = IMUSD(_musdTokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        collateralAddress = _collateralAddress;

        require(
            (Ownable(_borrowerOperationsAddress).owner() != address(0) ||
                borrowerOperations.collateralAddress() == _collateralAddress) &&
                (Ownable(_activePoolAddress).owner() != address(0) ||
                    activePool.collateralAddress() == _collateralAddress),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit CollateralAddressChanged(_collateralAddress);

        renounceOwnership();
    }

    /*  provideToSP():
     *
     * - Sends depositor's accumulated gains (collateral) to depositor
     */
    function provideToSP(uint256 _amount) external override {
        _requireNonZeroAmount(_amount);

        uint256 initialDeposit = deposits[msg.sender];

        uint256 depositorCollateralGain = getDepositorCollateralGain(
            msg.sender
        );
        uint256 compoundedMUSDDeposit = getCompoundedMUSDDeposit(msg.sender);
        uint256 MUSDLoss = initialDeposit - compoundedMUSDDeposit; // Needed only for event log

        uint256 newDeposit = compoundedMUSDDeposit + _amount;

        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit CollateralGainWithdrawn(
            msg.sender,
            depositorCollateralGain,
            MUSDLoss
        ); // MUSD Loss required for event log

        _sendMUSDtoStabilityPool(msg.sender, _amount);

        _sendCollateralGainToDepositor(depositorCollateralGain);
    }

    /*  withdrawFromSP():
     *
     * - Sends all depositor's accumulated gains (collateral) to depositor
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
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
        uint256 MUSDtoWithdraw = LiquityMath._min(
            _amount,
            compoundedMUSDDeposit
        );
        uint256 MUSDLoss = initialDeposit - compoundedMUSDDeposit; // Needed only for event log

        _sendMUSDToDepositor(msg.sender, MUSDtoWithdraw);

        // Update deposit
        uint256 newDeposit = compoundedMUSDDeposit - MUSDtoWithdraw;
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit CollateralGainWithdrawn(
            msg.sender,
            depositorCollateralGain,
            MUSDLoss
        ); // MUSD Loss required for event log

        _sendCollateralGainToDepositor(depositorCollateralGain);
    }

    /* withdrawCollateralGainToTrove:
     * - Transfers the depositor's entire collateral gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit */
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
        uint256 MUSDLoss = initialDeposit - compoundedMUSDDeposit; // Needed only for event log

        _updateDepositAndSnapshots(msg.sender, compoundedMUSDDeposit);

        /* Emit events before transferring collateral gain to Trove.
              This lets the event log make more sense (i.e. so it appears that first the collateral gain is withdrawn
             and then it is deposited into the Trove, not the other way around). */
        emit CollateralGainWithdrawn(
            msg.sender,
            depositorCollateralGain,
            MUSDLoss
        );
        emit UserDepositChanged(msg.sender, compoundedMUSDDeposit);

        collateral -= depositorCollateralGain;
        emit StabilityPoolCollateralBalanceUpdated(collateral);
        emit CollateralSent(msg.sender, depositorCollateralGain);

        if (collateralAddress == address(0)) {
            borrowerOperations.moveCollateralGainToTrove{
                value: depositorCollateralGain
            }(msg.sender, 0, _upperHint, _lowerHint);
        } else {
            borrowerOperations.moveCollateralGainToTrove{value: 0}(
                msg.sender,
                depositorCollateralGain,
                _upperHint,
                _lowerHint
            );
        }
    }

    /*
     * Cancels out the specified debt against the MUSD contained in the Stability Pool (as far as possible)
     * and transfers the Trove's collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(
        uint256 _debtToOffset,
        uint256 _collToAdd
    ) external override {
        _requireCallerIsTroveManager();
        uint256 totalMUSD = totalMUSDDeposits; // cached to save an SLOAD
        if (totalMUSD == 0 || _debtToOffset == 0) {
            return;
        }

        (
            uint256 collateralGainPerUnitStaked,
            uint256 MUSDLossPerUnitStaked
        ) = _computeRewardsPerUnitStaked(_collToAdd, _debtToOffset, totalMUSD);

        _updateRewardSumAndProduct(
            collateralGainPerUnitStaked,
            MUSDLossPerUnitStaked
        ); // updates S and P

        _moveOffsetCollAndDebt(_collToAdd, _debtToOffset);
    }

    // When ERC20 token collateral is received this function needs to be called
    function updateCollateralBalance(uint256 _amount) external override {
        _requireCallerIsActivePool();
        collateral += _amount;
        emit StabilityPoolCollateralBalanceUpdated(collateral);
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

    function _sendMUSDToDepositor(
        address _depositor,
        uint256 MUSDWithdrawal
    ) internal {
        if (MUSDWithdrawal == 0) {
            return;
        }

        // slither-disable-next-line unchecked-transfer
        musd.transfer(_depositor, MUSDWithdrawal);
        _decreaseMUSD(MUSDWithdrawal);
    }

    // Transfer the MUSD tokens from the user to the Stability Pool's address,
    // and update its recorded MUSD
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

        // Get S and G for the current epoch and current scale
        uint256 currentS = epochToScaleToSum[currentEpochCached][
            currentScaleCached
        ];

        // Record new snapshots of the latest running product P, sum S, and sum G, for the depositor
        depositSnapshots[_depositor].P = currentP;
        depositSnapshots[_depositor].S = currentS;
        depositSnapshots[_depositor].scale = currentScaleCached;
        depositSnapshots[_depositor].epoch = currentEpochCached;

        emit DepositSnapshotUpdated(_depositor, currentP, currentS);
    }

    function _sendCollateralGainToDepositor(uint256 _amount) internal {
        if (_amount == 0) {
            return;
        }
        uint256 newCollateral = collateral - _amount;
        collateral = newCollateral;
        emit StabilityPoolCollateralBalanceUpdated(newCollateral);
        emit CollateralSent(msg.sender, _amount);

        sendCollateral(IERC20(collateralAddress), msg.sender, _amount);
    }

    function _computeRewardsPerUnitStaked(
        uint256 _collToAdd,
        uint256 _debtToOffset,
        uint256 _totalMUSDDeposits
    )
        internal
        returns (
            uint256 collateralGainPerUnitStaked,
            uint256 MUSDLossPerUnitStaked
        )
    {
        /*
         * Compute the MUSD and collateral rewards. Uses a "feedback" error correction, to keep
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
            MUSDLossPerUnitStaked = DECIMAL_PRECISION; // When the Pool depletes to 0, so does each deposit
            lastMUSDLossError_Offset = 0;
        } else {
            uint256 MUSDLossNumerator = _debtToOffset *
                DECIMAL_PRECISION -
                lastMUSDLossError_Offset;
            /*
             * Add 1 to make error in quotient positive. We want "slightly too much" MUSD loss,
             * which ensures the error in any given compoundedMUSDDeposit favors the Stability Pool.
             */
            MUSDLossPerUnitStaked = MUSDLossNumerator / _totalMUSDDeposits + 1;
            lastMUSDLossError_Offset =
                MUSDLossPerUnitStaked *
                _totalMUSDDeposits -
                MUSDLossNumerator;
        }

        collateralGainPerUnitStaked = collateralNumerator / _totalMUSDDeposits;
        // slither-disable-next-line divide-before-multiply
        lastCollateralError_Offset =
            collateralNumerator -
            (collateralGainPerUnitStaked * _totalMUSDDeposits);

        return (collateralGainPerUnitStaked, MUSDLossPerUnitStaked);
    }

    function _moveOffsetCollAndDebt(
        uint256 _collToAdd,
        uint256 _debtToOffset
    ) internal {
        IActivePool activePoolCached = activePool;

        // Cancel the liquidated MUSD debt with the MUSD in the stability pool
        activePoolCached.decreaseMUSDDebt(_debtToOffset);
        _decreaseMUSD(_debtToOffset);

        // Burn the debt that was successfully offset
        musd.burn(address(this), _debtToOffset);

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
        uint256 _MUSDLossPerUnitStaked
    ) internal {
        uint256 currentP = P;
        uint256 newP;

        assert(_MUSDLossPerUnitStaked <= DECIMAL_PRECISION);
        /*
         * The newProductFactor is the factor by which to change all deposits, due to the depletion of Stability Pool MUSD in the liquidation.
         * We make the product factor 0 if there was a pool-emptying. Otherwise, it is (1 - MUSDLossPerUnitStaked)
         */
        uint256 newProductFactor = DECIMAL_PRECISION - _MUSDLossPerUnitStaked;

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

        // If the Stability Pool was emptied, increment the epoch, and reset the scale and product P
        if (newProductFactor == 0) {
            currentEpoch = currentEpochCached + 1;
            emit EpochUpdated(currentEpoch);
            currentScale = 0;
            emit ScaleUpdated(currentScale);
            newP = DECIMAL_PRECISION;

            // If multiplying P by a non-zero product factor would reduce P below the scale boundary, increment the scale
        } else if (
            (currentP * newProductFactor) / DECIMAL_PRECISION < SCALE_FACTOR
        ) {
            newP =
                (currentP * newProductFactor * SCALE_FACTOR) /
                DECIMAL_PRECISION;
            currentScale = currentScaleCached + 1;
            emit ScaleUpdated(currentScale);
        } else {
            newP = (currentP * newProductFactor) / DECIMAL_PRECISION;
        }

        assert(newP > 0);
        P = newP;

        emit PUpdated(newP);
    }

    // slither-disable-end dead-code

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

    function _requireNoUnderCollateralizedTroves() internal {
        uint256 price = priceFeed.fetchPrice();
        address lowestTrove = sortedTroves.getLast();
        uint256 ICR = troveManager.getCurrentICR(lowestTrove, price);
        require(
            ICR >= MCR,
            "StabilityPool: Cannot withdraw while there are troves with ICR < MCR"
        );
    }

    function _requireUserHasDeposit(uint256 _initialDeposit) internal pure {
        require(
            _initialDeposit > 0,
            "StabilityPool: User must have a non-zero deposit"
        );
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

    function _requireNonZeroAmount(uint256 _amount) internal pure {
        require(_amount > 0, "StabilityPool: Amount must be non-zero");
    }
}

// slither-disable-end reentrancy-benign
// slither-disable-end reentrancy-events
// slither-disable-end reentrancy-no-eth
