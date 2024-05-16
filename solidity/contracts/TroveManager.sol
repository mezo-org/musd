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
    uint256 public constant MAX_BORROWING_FEE = (DECIMAL_PRECISION / 100) * 5; // 5%

    uint256 public baseRate;

    // The timestamp of the latest fee operation (redemption or new THUSD issuance)
    uint256 public lastFeeOperationTime;

    mapping(address => Trove) public Troves;

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
    ) external override returns (uint) {}

    function updateTroveRewardSnapshots(address _borrower) external override {}

    function addTroveOwnerToArray(
        address _borrower
    ) external override returns (uint256 index) {}

    function applyPendingRewards(address _borrower) external override {}

    function closeTrove(address _borrower) external override {}

    function removeStake(address _borrower) external override {}

    function decayBaseRateFromBorrowing() external override {}

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
    ) external override returns (uint) {}

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
        uint256 _collDecrease
    ) external override returns (uint) {}

    function musd() external view override returns (IMUSD) {}

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

    function getPendingCollateralReward(
        address _borrower
    ) external view override returns (uint) {}

    function getPendingMUSDDebtReward(
        address _borrower
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
    {}

    function getRedemptionRate() external view override returns (uint) {}

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

    function getBorrowingRate() external view override returns (uint) {}

    function getBorrowingRateWithDecay() external view override returns (uint) {
        return _calcBorrowingRate(_calcDecayedBaseRate());
    }

    function getBorrowingFee(
        uint256 MUSDDebt
    ) external view override returns (uint) {}

    function getBorrowingFeeWithDecay(
        uint256 _MUSDDebt
    ) external view override returns (uint) {}

    function getTroveStatus(
        address _borrower
    ) external view override returns (Status) {}

    function getTroveStake(
        address _borrower
    ) external view override returns (uint) {}

    function getTroveDebt(
        address _borrower
    ) external view override returns (uint) {}

    function getTroveColl(
        address _borrower
    ) external view override returns (uint) {}

    function getTCR(uint256 _price) external view override returns (uint) {}

    function checkRecoveryMode(
        uint256 _price
    ) external view override returns (bool) {
        return _checkRecoveryMode(_price);
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

    // --- 'require' wrapper functions ---

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "TroveManager: Caller is not the BorrowerOperations contract"
        );
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
}
