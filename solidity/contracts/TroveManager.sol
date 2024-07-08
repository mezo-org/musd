// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IGasPool.sol";
import "./interfaces/IMUSD.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IPCV.sol";

import "./dependencies/console.sol";

contract TroveManager is LiquityBase, Ownable, CheckContract, ITroveManager {
    enum TroveManagerOperation {
        applyPendingRewards,
        liquidateInNormalMode,
        liquidateInRecoveryMode,
        redeemCollateral
    }

    // Store the necessary data for a trove
    struct Trove {
        uint256 debt;
        uint256 coll;
        uint256 stake;
        Status status;
        uint128 arrayIndex;
    }

    // Object containing the collateral and MUSD snapshots for a given active trove
    struct RewardSnapshot {
        uint256 collateral;
        uint256 MUSDDebt;
    }

    struct LocalVariables_OuterLiquidationFunction {
        uint256 price;
        uint256 MUSDInStabPool;
        bool recoveryModeAtStart;
        uint256 liquidatedDebt;
        uint256 liquidatedColl;
    }

    struct LocalVariables_InnerSingleLiquidateFunction {
        uint256 collToLiquidate;
        uint256 pendingDebtReward;
        uint256 pendingCollReward;
    }

    struct LiquidationTotals {
        uint256 totalCollInSequence;
        uint256 totalDebtInSequence;
        uint256 totalCollGasCompensation;
        uint256 totalMUSDGasCompensation;
        uint256 totalDebtToOffset;
        uint256 totalCollToSendToSP;
        uint256 totalDebtToRedistribute;
        uint256 totalCollToRedistribute;
        uint256 totalCollSurplus;
    }

    struct LocalVariables_LiquidationSequence {
        uint256 remainingMUSDInStabPool;
        uint256 i;
        uint256 ICR;
        address user;
        bool backToNormalMode;
        uint256 entireSystemDebt;
        uint256 entireSystemColl;
    }

    struct LiquidationValues {
        uint256 entireTroveDebt;
        uint256 entireTroveColl;
        uint256 collGasCompensation;
        uint256 MUSDGasCompensation;
        uint256 debtToOffset;
        uint256 collToSendToSP;
        uint256 debtToRedistribute;
        uint256 collToRedistribute;
        uint256 collSurplus;
    }

    // --- Connected contract declarations ---

    address public borrowerOperationsAddress;

    IStabilityPool public override stabilityPool;

    address public gasPoolAddress;

    ICollSurplusPool public collSurplusPool;

    IMUSD public musdToken;

    IPCV public override pcv;

    // A doubly linked list of Troves, sorted by their sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // --- Data structures ---

    /*
     * Half-life of 12h. 12h = 720 min
     * (1/2) = d^720 => d = (1/2)^(1/720)
     */
    uint256 public constant MINUTE_DECAY_FACTOR = 999037758833783000;
    uint256 public constant REDEMPTION_FEE_FLOOR =
        (DECIMAL_PRECISION / 1000) * 5; // 0.5%
    uint256 public constant MAX_BORROWING_FEE = (DECIMAL_PRECISION / 100) * 5; // 5%

    uint256 public baseRate;

    // The timestamp of the latest fee operation (redemption or new MUSD issuance)
    uint256 public lastFeeOperationTime;

    mapping(address => Trove) public Troves;

    uint256 public totalStakes;

    // Snapshot of the value of totalStakes, taken immediately after the latest liquidation
    uint256 public totalStakesSnapshot;

    // Snapshot of the total collateral across the ActivePool and DefaultPool, immediately after the latest liquidation.
    uint256 public totalCollateralSnapshot;

    /*
     * L_Collateral and L_MUSDDebt track the sums of accumulated liquidation rewards per unit staked. During its lifetime, each stake earns:
     *
     * An collateral gain of ( stake * [L_Collateral - L_Collateral(0)] )
     * A MUSDDebt increase  of ( stake * [L_MUSDDebt - L_MUSDDebt(0)] )
     *
     * Where L_Collateral(0) and L_MUSDDebt(0) are snapshots of L_Collateral and L_MUSDDebt for the active Trove taken at the instant the stake was made
     */
    uint256 public L_Collateral;
    uint256 public L_MUSDDebt;

    // Array of all active trove addresses - used to to compute an approximate hint off-chain, for the sorted list insertion
    address[] public TroveOwners;

    // Error trackers for the trove redistribution calculation
    uint256 public lastCollateralError_Redistribution;
    uint256 public lastMUSDDebtError_Redistribution;

    // Map addresses with active troves to their RewardSnapshot
    mapping(address => RewardSnapshot) public rewardSnapshots;

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
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
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_stabilityPoolAddress);

        // slither-disable-next-line missing-zero-check
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        stabilityPool = IStabilityPool(_stabilityPoolAddress);
        // slither-disable-next-line missing-zero-check
        gasPoolAddress = _gasPoolAddress;
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        musdToken = IMUSD(_musdTokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        pcv = IPCV(_pcvAddress);

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit PCVAddressChanged(_pcvAddress);

        renounceOwnership();
    }

    function liquidate(address _borrower) external override {
        _requireTroveIsActive(_borrower);

        address[] memory borrowers = new address[](1);
        borrowers[0] = _borrower;
        batchLiquidateTroves(borrowers);
    }

    function liquidateTroves(uint256 _n) external override {}

    function redeemCollateral(
        uint256 _MUSDAmount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR,
        uint256 _maxIterations,
        uint256 _maxFee
    ) external override {}

    function updateStakeAndTotalStakes(
        address _borrower
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        return _updateStakeAndTotalStakes(_borrower);
    }

    // Update borrower's snapshots of L_Collateral and L_MUSDDebt to reflect the current values
    function updateTroveRewardSnapshots(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _updateTroveRewardSnapshots(_borrower);
    }

    // Push the owner's address to the Trove owners list, and record the corresponding array index on the Trove struct
    function addTroveOwnerToArray(
        address _borrower
    ) external override returns (uint256 index) {
        _requireCallerIsBorrowerOperations();
        return _addTroveOwnerToArray(_borrower);
    }

    function applyPendingRewards(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _applyPendingRewards(activePool, defaultPool, _borrower);
    }

    function closeTrove(address _borrower) external override {
        _requireCallerIsBorrowerOperations();
        return _closeTrove(_borrower, Status.closedByOwner);
    }

    function removeStake(address _borrower) external override {}

    // Updates the baseRate state variable based on time elapsed since the last redemption or MUSD borrowing operation.
    function decayBaseRateFromBorrowing() external override {
        _requireCallerIsBorrowerOperations();

        uint256 decayedBaseRate = _calcDecayedBaseRate();
        assert(decayedBaseRate <= DECIMAL_PRECISION); // The baseRate can decay to 0

        baseRate = decayedBaseRate;
        emit BaseRateUpdated(decayedBaseRate);

        _updateLastFeeOpTime();
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
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newColl = Troves[_borrower].coll + _collIncrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function decreaseTroveColl(
        address _borrower,
        uint256 _collDecrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newColl = Troves[_borrower].coll - _collDecrease;
        Troves[_borrower].coll = newColl;
        return newColl;
    }

    function increaseTroveDebt(
        address _borrower,
        uint256 _debtIncrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newDebt = Troves[_borrower].debt + _debtIncrease;
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    function decreaseTroveDebt(
        address _borrower,
        uint256 _debtDecrease
    ) external override returns (uint) {
        _requireCallerIsBorrowerOperations();
        uint256 newDebt = Troves[_borrower].debt - _debtDecrease;
        Troves[_borrower].debt = newDebt;
        return newDebt;
    }

    function getTroveOwnersCount() external view override returns (uint) {
        return TroveOwners.length;
    }

    function getTroveFromTroveOwnersArray(
        uint256 _index
    ) external view override returns (address) {}

    function getNominalICR(
        address _borrower
    ) external view override returns (uint) {}

    function getRedemptionRateWithDecay()
        external
        view
        override
        returns (uint)
    {}

    function getRedemptionFeeWithDecay(
        uint256 _collateralDrawn
    ) external view override returns (uint) {}

    // --- Borrowing fee functions ---

    function getBorrowingFee(
        uint256 MUSDDebt
    ) external view override returns (uint) {
        return _calcBorrowingFee(getBorrowingRate(), MUSDDebt);
    }

    function getBorrowingFeeWithDecay(
        uint256 _MUSDDebt
    ) external view override returns (uint) {
        return _calcBorrowingFee(getBorrowingRateWithDecay(), _MUSDDebt);
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
        return Troves[_borrower].debt;
    }

    function getTroveColl(
        address _borrower
    ) external view override returns (uint) {
        return Troves[_borrower].coll;
    }

    function getTCR(uint256 _price) external view override returns (uint) {
        return _getTCR(_price);
    }

    function checkRecoveryMode(
        uint256 _price
    ) external view override returns (bool) {
        return _checkRecoveryMode(_price);
    }

    /*
     * Attempt to liquidate a custom list of troves provided by the caller.
     */
    function batchLiquidateTroves(
        address[] memory _troveArray
    ) public override {
        require(
            _troveArray.length != 0,
            "TroveManager: Calldata address array must not be empty"
        );

        IActivePool activePoolCached = activePool;
        IDefaultPool defaultPoolCached = defaultPool;
        IStabilityPool stabilityPoolCached = stabilityPool;

        LocalVariables_OuterLiquidationFunction memory vars;
        LiquidationTotals memory totals;

        vars.price = priceFeed.fetchPrice();
        vars.MUSDInStabPool = stabilityPoolCached.getTotalMUSDDeposits();
        vars.recoveryModeAtStart = _checkRecoveryMode(vars.price);

        // Perform the appropriate liquidation sequence - tally values and obtain their totals.
        if (vars.recoveryModeAtStart) {
            totals = _getTotalFromBatchLiquidateRecoveryMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.MUSDInStabPool,
                _troveArray
            );
        } else {
            //  if !vars.recoveryModeAtStart
            totals = _getTotalsFromBatchLiquidateNormalMode(
                activePoolCached,
                defaultPoolCached,
                vars.price,
                vars.MUSDInStabPool,
                _troveArray
            );
        }

        require(
            totals.totalDebtInSequence > 0,
            "TroveManager: nothing to liquidate"
        );

        // Move liquidated collateral and MUSD to the appropriate pools
        stabilityPoolCached.offset(
            totals.totalDebtToOffset,
            totals.totalCollToSendToSP
        );
        _redistributeDebtAndColl(
            activePoolCached,
            defaultPoolCached,
            totals.totalDebtToRedistribute,
            totals.totalCollToRedistribute
        );
        if (totals.totalCollSurplus > 0) {
            activePoolCached.sendCollateral(
                address(collSurplusPool),
                totals.totalCollSurplus
            );
        }

        // Update system snapshots
        _updateSystemSnapshotsExcludeCollRemainder(
            activePoolCached,
            totals.totalCollGasCompensation
        );

        vars.liquidatedDebt = totals.totalDebtInSequence;
        vars.liquidatedColl =
            totals.totalCollInSequence -
            totals.totalCollGasCompensation -
            totals.totalCollSurplus;
        emit Liquidation(
            vars.liquidatedDebt,
            vars.liquidatedColl,
            totals.totalCollGasCompensation,
            totals.totalMUSDGasCompensation
        );

        // Send gas compensation to caller
        _sendGasCompensation(
            activePoolCached,
            msg.sender,
            totals.totalMUSDGasCompensation,
            totals.totalCollGasCompensation
        );
    }

    function getCurrentICR(
        address _borrower,
        uint256 _price
    ) public view override returns (uint) {
        (
            uint256 currentCollateral,
            uint256 currentMUSDDebt
        ) = _getCurrentTroveAmounts(_borrower);
        uint256 ICR = LiquityMath._computeCR(
            currentCollateral,
            currentMUSDDebt,
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
            uint256 debt,
            uint256 coll,
            uint256 pendingMUSDDebtReward,
            uint256 pendingCollateralReward
        )
    {
        debt = Troves[_borrower].debt;
        coll = Troves[_borrower].coll;

        pendingMUSDDebtReward = getPendingMUSDDebtReward(_borrower);
        pendingCollateralReward = getPendingCollateralReward(_borrower);

        debt += pendingMUSDDebtReward;
        coll += pendingCollateralReward;
    }
    function getBorrowingRate() public view override returns (uint) {
        return _calcBorrowingRate(baseRate);
    }

    function getBorrowingRateWithDecay() public view override returns (uint) {
        return _calcBorrowingRate(_calcDecayedBaseRate());
    }

    function getPendingCollateralReward(
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

        uint256 pendingCollateralReward = (stake * rewardPerUnitStaked) /
            DECIMAL_PRECISION;

        return pendingCollateralReward;
    }

    function getPendingMUSDDebtReward(
        address _borrower
    ) public view override returns (uint) {
        uint256 snapshotMUSDDebt = rewardSnapshots[_borrower].MUSDDebt;
        uint256 rewardPerUnitStaked = L_MUSDDebt - snapshotMUSDDebt;

        if (
            rewardPerUnitStaked == 0 ||
            Troves[_borrower].status != Status.active
        ) {
            return 0;
        }

        uint256 stake = Troves[_borrower].stake;

        uint256 pendingMUSDDebtReward = (stake * rewardPerUnitStaked) /
            DECIMAL_PRECISION;

        return pendingMUSDDebtReward;
    }

    function getRedemptionRate() public view override returns (uint) {
        return _calcRedemptionRate(baseRate);
    }

    // Add the borrowers's coll and debt rewards earned from redistributions, to their Trove
    function _applyPendingRewards(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower
    ) internal {
        if (hasPendingRewards(_borrower)) {
            _requireTroveIsActive(_borrower);

            // Compute pending rewards
            uint256 pendingCollateralReward = getPendingCollateralReward(
                _borrower
            );
            uint256 pendingMUSDDebtReward = getPendingMUSDDebtReward(_borrower);

            // Apply pending rewards to trove's state
            Troves[_borrower].coll += pendingCollateralReward;
            Troves[_borrower].debt += pendingMUSDDebtReward;

            _updateTroveRewardSnapshots(_borrower);

            // Transfer from DefaultPool to ActivePool
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                pendingMUSDDebtReward,
                pendingCollateralReward
            );

            emit TroveUpdated(
                _borrower,
                Troves[_borrower].debt,
                Troves[_borrower].coll,
                Troves[_borrower].stake,
                uint8(TroveManagerOperation.applyPendingRewards)
            );
        }
    }

    function _sendGasCompensation(
        IActivePool _activePool,
        address _liquidator,
        uint256 _MUSD,
        uint256 _collateral
    ) internal {
        if (_MUSD > 0) {
            IGasPool(gasPoolAddress).sendMUSD(_liquidator, _MUSD);
        }

        if (_collateral > 0) {
            _activePool.sendCollateral(_liquidator, _collateral);
        }
    }

    /*
     * Updates snapshots of system total stakes and total collateral, excluding a given collateral remainder from the calculation.
     * Used in a liquidation sequence.
     *
     * The calculation excludes a portion of collateral that is in the ActivePool:
     *
     * the total collateral gas compensation from the liquidation sequence
     *
     * The collateral as compensation must be excluded as it is always sent out at the very end of the liquidation sequence.
     */
    function _updateSystemSnapshotsExcludeCollRemainder(
        IActivePool _activePool,
        uint256 _collRemainder
    ) internal {
        totalStakesSnapshot = totalStakes;

        uint256 activeColl = _activePool.getCollateralBalance();
        uint256 liquidatedColl = defaultPool.getCollateralBalance();
        totalCollateralSnapshot = activeColl - _collRemainder + liquidatedColl;

        emit SystemSnapshotsUpdated(
            totalStakesSnapshot,
            totalCollateralSnapshot
        );
    }

    function _redistributeDebtAndColl(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _debt,
        uint256 _coll
    ) internal {
        if (_debt == 0) {
            return;
        }

        /*
         * Add distributed coll and debt rewards-per-unit-staked to the running totals. Division uses a "feedback"
         * error correction, to keep the cumulative error low in the running totals L_Collateral and L_MUSDDebt:
         *
         * 1) Form numerators which compensate for the floor division errors that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
         * 4) Store these errors for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint256 collateralNumerator = _coll *
            DECIMAL_PRECISION +
            lastCollateralError_Redistribution;
        uint256 MUSDDebtNumerator = _debt *
            DECIMAL_PRECISION +
            lastMUSDDebtError_Redistribution;

        // Get the per-unit-staked terms
        uint256 collateralRewardPerUnitStaked = collateralNumerator /
            totalStakes;
        uint256 MUSDDebtRewardPerUnitStaked = MUSDDebtNumerator / totalStakes;

        lastCollateralError_Redistribution =
            collateralNumerator -
            (collateralRewardPerUnitStaked * totalStakes);
        lastMUSDDebtError_Redistribution =
            MUSDDebtNumerator -
            (MUSDDebtRewardPerUnitStaked * totalStakes);

        // Add per-unit-staked terms to the running totals
        L_Collateral += collateralRewardPerUnitStaked;
        L_MUSDDebt += MUSDDebtRewardPerUnitStaked;

        emit LTermsUpdated(L_Collateral, L_MUSDDebt);

        // Transfer coll and debt from ActivePool to DefaultPool
        _activePool.decreaseMUSDDebt(_debt);
        _defaultPool.increaseMUSDDebt(_debt);
        _activePool.sendCollateral(address(_defaultPool), _coll);
    }

    // Liquidate one trove, in Normal Mode.
    function _liquidateNormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower,
        uint256 _MUSDInStabPool
    ) internal returns (LiquidationValues memory singleLiquidation) {
        LocalVariables_InnerSingleLiquidateFunction memory vars;

        (
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            vars.pendingDebtReward,
            vars.pendingCollReward
        ) = getEntireDebtAndColl(_borrower);

        _movePendingTroveRewardsToActivePool(
            _activePool,
            _defaultPool,
            vars.pendingDebtReward,
            vars.pendingCollReward
        );
        _removeStake(_borrower);

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            singleLiquidation.entireTroveColl
        );
        singleLiquidation.MUSDGasCompensation = MUSD_GAS_COMPENSATION;
        uint256 collToLiquidate = singleLiquidation.entireTroveColl -
            singleLiquidation.collGasCompensation;

        (
            singleLiquidation.debtToOffset,
            singleLiquidation.collToSendToSP,
            singleLiquidation.debtToRedistribute,
            singleLiquidation.collToRedistribute
        ) = _getOffsetAndRedistributionVals(
            singleLiquidation.entireTroveDebt,
            collToLiquidate,
            _MUSDInStabPool
        );

        _closeTrove(_borrower, Status.closedByLiquidation);
        emit TroveLiquidated(
            _borrower,
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            uint8(TroveManagerOperation.liquidateInNormalMode)
        );
        emit TroveUpdated(
            _borrower,
            0,
            0,
            0,
            uint8(TroveManagerOperation.liquidateInNormalMode)
        );
        return singleLiquidation;
    }

    // Remove borrower's stake from the totalStakes sum, and set their stake to 0
    function _removeStake(address _borrower) internal {
        uint256 stake = Troves[_borrower].stake;
        totalStakes -= stake;
        Troves[_borrower].stake = 0;
    }

    function _getTotalsFromBatchLiquidateNormalMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _price,
        uint256 _MUSDInStabPool,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingMUSDInStabPool = _MUSDInStabPool;

        for (vars.i = 0; vars.i < _troveArray.length; vars.i++) {
            vars.user = _troveArray[vars.i];
            vars.ICR = getCurrentICR(vars.user, _price);

            if (vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingMUSDInStabPool
                );
                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            }
        }
    }

    /*
     * This function is used when the batch liquidation sequence starts during Recovery Mode. However, it
     * handle the case where the system *leaves* Recovery Mode, part way through the liquidation sequence
     */
    function _getTotalFromBatchLiquidateRecoveryMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _price,
        uint256 _MUSDInStabPool,
        address[] memory _troveArray
    ) internal returns (LiquidationTotals memory totals) {
        LocalVariables_LiquidationSequence memory vars;
        LiquidationValues memory singleLiquidation;

        vars.remainingMUSDInStabPool = _MUSDInStabPool;
        vars.backToNormalMode = false;
        vars.entireSystemDebt = getEntireSystemDebt();
        vars.entireSystemColl = getEntireSystemColl();

        for (vars.i = 0; vars.i < _troveArray.length; vars.i++) {
            vars.user = _troveArray[vars.i];
            // Skip non-active troves
            if (Troves[vars.user].status != Status.active) {
                continue;
            }
            vars.ICR = getCurrentICR(vars.user, _price);

            if (!vars.backToNormalMode) {
                // Skip this trove if ICR is greater than MCR and Stability Pool is empty
                if (vars.ICR >= MCR && vars.remainingMUSDInStabPool == 0) {
                    continue;
                }

                uint256 TCR = LiquityMath._computeCR(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );

                singleLiquidation = _liquidateRecoveryMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.ICR,
                    vars.remainingMUSDInStabPool,
                    TCR,
                    _price
                );

                // Update aggregate trackers
                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;
                vars.entireSystemDebt -= singleLiquidation.debtToOffset;
                vars.entireSystemColl -=
                    singleLiquidation.collToSendToSP +
                    singleLiquidation.collGasCompensation +
                    singleLiquidation.collSurplus;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );

                vars.backToNormalMode = !_checkPotentialRecoveryMode(
                    vars.entireSystemColl,
                    vars.entireSystemDebt,
                    _price
                );
            } else if (vars.backToNormalMode && vars.ICR < MCR) {
                singleLiquidation = _liquidateNormalMode(
                    _activePool,
                    _defaultPool,
                    vars.user,
                    vars.remainingMUSDInStabPool
                );
                vars.remainingMUSDInStabPool -= singleLiquidation.debtToOffset;

                // Add liquidation values to their respective running totals
                totals = _addLiquidationValuesToTotals(
                    totals,
                    singleLiquidation
                );
            } else continue; // In Normal Mode skip troves with ICR >= MCR
        }
    }

    // Liquidate one trove, in Recovery Mode.
    function _liquidateRecoveryMode(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        address _borrower,
        uint256 _ICR,
        uint256 _MUSDInStabPool,
        uint256 _TCR,
        uint256 _price
    ) internal returns (LiquidationValues memory singleLiquidation) {
        LocalVariables_InnerSingleLiquidateFunction memory vars;
        if (TroveOwners.length <= 1) {
            return singleLiquidation;
        } // don't liquidate if last trove
        (
            singleLiquidation.entireTroveDebt,
            singleLiquidation.entireTroveColl,
            vars.pendingDebtReward,
            vars.pendingCollReward
        ) = getEntireDebtAndColl(_borrower);

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            singleLiquidation.entireTroveColl
        );
        singleLiquidation.MUSDGasCompensation = MUSD_GAS_COMPENSATION;
        vars.collToLiquidate =
            singleLiquidation.entireTroveColl -
            singleLiquidation.collGasCompensation;

        // If ICR <= 100%, purely redistribute the Trove across all active Troves
        if (_ICR <= _100pct) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            _removeStake(_borrower);

            singleLiquidation.debtToOffset = 0;
            singleLiquidation.collToSendToSP = 0;
            singleLiquidation.debtToRedistribute = singleLiquidation
                .entireTroveDebt;
            singleLiquidation.collToRedistribute = vars.collToLiquidate;

            _closeTrove(_borrower, Status.closedByLiquidation);
            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );

            // If 100% < ICR < MCR, offset as much as possible, and redistribute the remainder
        } else if ((_ICR > _100pct) && (_ICR < MCR)) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            _removeStake(_borrower);

            (
                singleLiquidation.debtToOffset,
                singleLiquidation.collToSendToSP,
                singleLiquidation.debtToRedistribute,
                singleLiquidation.collToRedistribute
            ) = _getOffsetAndRedistributionVals(
                singleLiquidation.entireTroveDebt,
                vars.collToLiquidate,
                _MUSDInStabPool
            );

            _closeTrove(_borrower, Status.closedByLiquidation);
            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            /*
             * If 110% <= ICR < current TCR (accounting for the preceding liquidations in the current sequence)
             * and there is MUSD in the Stability Pool, only offset, with no redistribution,
             * but at a capped rate of 1.1 and only if the whole debt can be liquidated.
             * The remainder due to the capped rate will be claimable as collateral surplus.
             */
        } else if (
            (_ICR >= MCR) &&
            (_ICR < _TCR) &&
            (singleLiquidation.entireTroveDebt <= _MUSDInStabPool)
        ) {
            _movePendingTroveRewardsToActivePool(
                _activePool,
                _defaultPool,
                vars.pendingDebtReward,
                vars.pendingCollReward
            );
            assert(_MUSDInStabPool != 0);

            _removeStake(_borrower);
            singleLiquidation = _getCappedOffsetVals(
                singleLiquidation.entireTroveDebt,
                singleLiquidation.entireTroveColl,
                _price
            );

            _closeTrove(_borrower, Status.closedByLiquidation);
            if (singleLiquidation.collSurplus > 0) {
                collSurplusPool.accountSurplus(
                    _borrower,
                    singleLiquidation.collSurplus
                );
            }

            emit TroveLiquidated(
                _borrower,
                singleLiquidation.entireTroveDebt,
                singleLiquidation.collToSendToSP,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
            emit TroveUpdated(
                _borrower,
                0,
                0,
                0,
                uint8(TroveManagerOperation.liquidateInRecoveryMode)
            );
        } else {
            // if (_ICR >= MCR && ( _ICR >= _TCR || singleLiquidation.entireTroveDebt > _MUSDInStabPool))
            LiquidationValues memory zeroVals;
            return zeroVals;
        }

        return singleLiquidation;
    }

    // Update borrower's stake based on their latest collateral value
    function _updateStakeAndTotalStakes(
        address _borrower
    ) internal returns (uint) {
        uint256 newStake = _computeNewStake(Troves[_borrower].coll);
        uint256 oldStake = Troves[_borrower].stake;
        Troves[_borrower].stake = newStake;

        totalStakes = totalStakes - oldStake + newStake;
        emit TotalStakesUpdated(totalStakes);

        return newStake;
    }

    function _updateTroveRewardSnapshots(address _borrower) internal {
        rewardSnapshots[_borrower].collateral = L_Collateral;
        rewardSnapshots[_borrower].MUSDDebt = L_MUSDDebt;
        emit TroveSnapshotsUpdated(L_Collateral, L_MUSDDebt);
    }

    function _addTroveOwnerToArray(
        address _borrower
    ) internal returns (uint128 index) {
        /* Max array size is 2**128 - 1, i.e. ~3e30 troves. No risk of overflow, since troves have minimum MUSD
        debt of liquidation reserve plus MIN_NET_DEBT. 3e30 MUSD dwarfs the value of all wealth in the world ( which is < 1e15 USD). */

        // Push the Troveowner to the array
        TroveOwners.push(_borrower);

        // Record the index of the new Troveowner on their Trove struct
        index = uint128(TroveOwners.length - 1);
        Troves[_borrower].arrayIndex = index;

        return index;
    }

    function _updateLastFeeOpTime() internal {
        // solhint-disable-next-line not-rely-on-time
        uint256 timePassed = block.timestamp - lastFeeOperationTime;

        if (timePassed >= 1 minutes) {
            // solhint-disable-next-line not-rely-on-time
            lastFeeOperationTime = block.timestamp;
            // solhint-disable-next-line not-rely-on-time
            emit LastFeeOpTimeUpdated(block.timestamp);
        }
    }

    // Move a Trove's pending debt and collateral rewards from distributions, from the Default Pool to the Active Pool
    function _movePendingTroveRewardsToActivePool(
        IActivePool _activePool,
        IDefaultPool _defaultPool,
        uint256 _MUSD,
        uint256 _collateral
    ) internal {
        _defaultPool.decreaseMUSDDebt(_MUSD);
        _activePool.increaseMUSDDebt(_MUSD);
        _defaultPool.sendCollateralToActivePool(_collateral);
    }

    function _closeTrove(address _borrower, Status closedStatus) internal {
        assert(
            closedStatus != Status.nonExistent && closedStatus != Status.active
        );

        uint256 TroveOwnersArrayLength = TroveOwners.length;
        if (musdToken.mintList(borrowerOperationsAddress)) {
            _requireMoreThanOneTroveInSystem(TroveOwnersArrayLength);
        }

        Troves[_borrower].status = closedStatus;
        Troves[_borrower].coll = 0;
        Troves[_borrower].debt = 0;

        rewardSnapshots[_borrower].collateral = 0;
        rewardSnapshots[_borrower].MUSDDebt = 0;

        _removeTroveOwner(_borrower, TroveOwnersArrayLength);
        sortedTroves.remove(_borrower);
    }

    /*
     * Remove a Trove owner from the TroveOwners array, not preserving array order. Removing owner 'B' does the following:
     * [A B C D E] => [A E C D], and updates E's Trove struct to point to its new array index.
     */
    function _removeTroveOwner(
        address _borrower,
        uint256 TroveOwnersArrayLength
    ) internal {
        Status troveStatus = Troves[_borrower].status;
        // It’s set in caller function `_closeTrove`
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

        TroveOwners.pop();
    }

    function _requireMoreThanOneTroveInSystem(
        uint256 TroveOwnersArrayLength
    ) internal view {
        require(
            TroveOwnersArrayLength > 1 && sortedTroves.getSize() > 1,
            "TroveManager: Only one trove in the system"
        );
    }

    function _getCurrentTroveAmounts(
        address _borrower
    ) internal view returns (uint, uint) {
        uint256 pendingCollateralReward = getPendingCollateralReward(_borrower);
        uint256 pendingMUSDDebtReward = getPendingMUSDDebtReward(_borrower);

        uint256 currentCollateral = Troves[_borrower].coll +
            pendingCollateralReward;
        uint256 currentMUSDDebt = Troves[_borrower].debt +
            pendingMUSDDebtReward;

        return (currentCollateral, currentMUSDDebt);
    }

    // Calculate a new stake based on the snapshots of the totalStakes and totalCollateral taken at the last liquidation
    function _computeNewStake(uint256 _coll) internal view returns (uint) {
        uint256 stake;
        if (totalCollateralSnapshot == 0) {
            stake = _coll;
        } else {
            /*
             * The following assert() holds true because:
             * - The system always contains >= 1 trove
             * - When we close or liquidate a trove, we redistribute the pending rewards, so if all troves were closed/liquidated,
             * rewards would’ve been emptied and totalCollateralSnapshot would be zero too.
             */
            assert(totalStakesSnapshot > 0);
            stake = (_coll * totalStakesSnapshot) / totalCollateralSnapshot;
        }
        return stake;
    }

    function _getRedemptionFee(
        uint256 _collateralDrawn
    ) internal view returns (uint) {
        return _calcRedemptionFee(getRedemptionRate(), _collateralDrawn);
    }

    function _calcDecayedBaseRate() internal view returns (uint) {
        uint256 minutesPassed = _minutesPassedSinceLastFeeOp();
        uint256 decayFactor = LiquityMath._decPow(
            MINUTE_DECAY_FACTOR,
            minutesPassed
        );

        return (baseRate * decayFactor) / DECIMAL_PRECISION;
    }

    function _minutesPassedSinceLastFeeOp() internal view returns (uint) {
        // solhint-disable-next-line not-rely-on-time
        return (block.timestamp - lastFeeOperationTime) / 1 minutes;
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "TroveManager: Caller is not the BorrowerOperations contract"
        );
    }

    function _requireTroveIsActive(address _borrower) internal view {
        require(
            Troves[_borrower].status == Status.active,
            "TroveManager: Trove does not exist or is closed"
        );
    }

    /* In a full liquidation, returns the values for a trove's coll and debt to be offset, and coll and debt to be
     * redistributed to active troves.
     */
    function _getOffsetAndRedistributionVals(
        uint256 _debt,
        uint256 _coll,
        uint256 _MUSDInStabPool
    )
        internal
        pure
        returns (
            uint256 debtToOffset,
            uint256 collToSendToSP,
            uint256 debtToRedistribute,
            uint256 collToRedistribute
        )
    {
        if (_MUSDInStabPool > 0) {
            /*
             * Offset as much debt & collateral as possible against the Stability Pool, and redistribute the remainder
             * between all active troves.
             *
             *  If the trove's debt is larger than the deposited MUSD in the Stability Pool:
             *
             *  - Offset an amount of the trove's debt equal to the MUSD in the Stability Pool
             *  - Send a fraction of the trove's collateral to the Stability Pool, equal to the fraction of its offset debt
             *
             */
            debtToOffset = LiquityMath._min(_debt, _MUSDInStabPool);
            collToSendToSP = (_coll * debtToOffset) / _debt;
            debtToRedistribute = _debt - debtToOffset;
            collToRedistribute = _coll - collToSendToSP;
        } else {
            debtToOffset = 0;
            collToSendToSP = 0;
            debtToRedistribute = _debt;
            collToRedistribute = _coll;
        }
    }

    // Check whether or not the system *would be* in Recovery Mode, given an collateral:USD price, and the entire system coll and debt.
    function _checkPotentialRecoveryMode(
        uint256 _entireSystemColl,
        uint256 _entireSystemDebt,
        uint256 _price
    ) internal pure returns (bool) {
        uint256 TCR = LiquityMath._computeCR(
            _entireSystemColl,
            _entireSystemDebt,
            _price
        );

        return TCR < CCR;
    }

    /*
     *  Get its offset coll/debt and collateral gas comp, and close the trove.
     */
    function _getCappedOffsetVals(
        uint256 _entireTroveDebt,
        uint256 _entireTroveColl,
        uint256 _price
    ) internal pure returns (LiquidationValues memory singleLiquidation) {
        singleLiquidation.entireTroveDebt = _entireTroveDebt;
        singleLiquidation.entireTroveColl = _entireTroveColl;
        uint256 cappedCollPortion = (_entireTroveDebt * MCR) / _price;

        singleLiquidation.collGasCompensation = _getCollGasCompensation(
            cappedCollPortion
        );
        singleLiquidation.MUSDGasCompensation = MUSD_GAS_COMPENSATION;

        singleLiquidation.debtToOffset = _entireTroveDebt;
        singleLiquidation.collToSendToSP =
            cappedCollPortion -
            singleLiquidation.collGasCompensation;
        singleLiquidation.collSurplus = _entireTroveColl - cappedCollPortion;
        singleLiquidation.debtToRedistribute = 0;
        singleLiquidation.collToRedistribute = 0;
    }

    function _addLiquidationValuesToTotals(
        LiquidationTotals memory oldTotals,
        LiquidationValues memory singleLiquidation
    ) internal pure returns (LiquidationTotals memory newTotals) {
        // Tally all the values with their respective running totals
        newTotals.totalCollGasCompensation =
            oldTotals.totalCollGasCompensation +
            singleLiquidation.collGasCompensation;
        newTotals.totalMUSDGasCompensation =
            oldTotals.totalMUSDGasCompensation +
            singleLiquidation.MUSDGasCompensation;
        newTotals.totalDebtInSequence =
            oldTotals.totalDebtInSequence +
            singleLiquidation.entireTroveDebt;
        newTotals.totalCollInSequence =
            oldTotals.totalCollInSequence +
            singleLiquidation.entireTroveColl;
        newTotals.totalDebtToOffset =
            oldTotals.totalDebtToOffset +
            singleLiquidation.debtToOffset;
        newTotals.totalCollToSendToSP =
            oldTotals.totalCollToSendToSP +
            singleLiquidation.collToSendToSP;
        newTotals.totalDebtToRedistribute =
            oldTotals.totalDebtToRedistribute +
            singleLiquidation.debtToRedistribute;
        newTotals.totalCollToRedistribute =
            oldTotals.totalCollToRedistribute +
            singleLiquidation.collToRedistribute;
        newTotals.totalCollSurplus =
            oldTotals.totalCollSurplus +
            singleLiquidation.collSurplus;

        return newTotals;
    }

    function _calcBorrowingFee(
        uint256 _borrowingRate,
        uint256 _MUSDDebt
    ) internal pure returns (uint) {
        return (_borrowingRate * _MUSDDebt) / DECIMAL_PRECISION;
    }

    function _calcBorrowingRate(
        uint256 _baseRate
    ) internal pure returns (uint) {
        return
            LiquityMath._min(
                BORROWING_FEE_FLOOR + _baseRate,
                MAX_BORROWING_FEE
            );
    }

    function _calcRedemptionFee(
        uint256 _redemptionRate,
        uint256 _collateralDrawn
    ) internal pure returns (uint) {
        uint256 redemptionFee = (_redemptionRate * _collateralDrawn) /
            DECIMAL_PRECISION;
        require(
            redemptionFee < _collateralDrawn,
            "TroveManager: Fee would eat up all returned collateral"
        );
        return redemptionFee;
    }

    function _calcRedemptionRate(
        uint256 _baseRate
    ) internal pure returns (uint) {
        return
            LiquityMath._min(
                REDEMPTION_FEE_FLOOR + _baseRate,
                DECIMAL_PRECISION // cap at a maximum of 100%
            );
    }
}
