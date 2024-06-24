// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IMUSD.sol";
import "./interfaces/IStabilityPool.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IPCV.sol";

contract TroveManager is LiquityBase, Ownable, CheckContract, ITroveManager {
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

    function liquidate(address _borrower) external override {}

    function liquidateTroves(uint256 _n) external override {}

    function batchLiquidateTroves(
        address[] calldata _troveArray
    ) external override {}

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

    function applyPendingRewards(address _borrower) external override {}

    function closeTrove(address _borrower) external override {}

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

    function getTroveOwnersCount() external view override returns (uint) {}

    function getTroveFromTroveOwnersArray(
        uint256 _index
    ) external view override returns (address) {}

    function getNominalICR(
        address _borrower
    ) external view override returns (uint) {}

    function getCurrentICR(
        address _borrower,
        uint256 _price
    ) external view override returns (uint) {}

    function hasPendingRewards(
        address _borrower
    ) external view override returns (bool) {}

    function getEntireDebtAndColl(
        address _borrower
    )
        external
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
    ) external view override returns (uint) {}

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

    function getTCR(uint256 _price) external view override returns (uint) {}

    function checkRecoveryMode(
        uint256 _price
    ) external view override returns (bool) {
        return _checkRecoveryMode(_price);
    }

    function getBorrowingRate() public view override returns (uint) {}

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
