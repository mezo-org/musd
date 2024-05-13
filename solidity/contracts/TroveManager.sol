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
    // --- Connected contract declarations ---

    address public borrowerOperationsAddress;

    IStabilityPool public override stabilityPool;

    address public gasPoolAddress;

    ICollSurplusPool public collSurplusPool;

    IMUSD public musdToken;

    IPCV public override pcv;

    // A doubly linked list of Troves, sorted by their sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _borrowerOperationsAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _musdTokenAddress,
        address _sortedTrovesAddress,
        address _pcvAddress
    ) external override onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_priceFeedAddress);
        checkContract(_musdTokenAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_pcvAddress);

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

    function setTroveStatus(
        address _borrower,
        Status _status
    ) external override {}

    function increaseTroveColl(
        address _borrower,
        uint256 _collIncrease
    ) external override returns (uint) {}

    function decreaseTroveColl(
        address _borrower,
        uint256 _collDecrease
    ) external override returns (uint) {}

    function increaseTroveDebt(
        address _borrower,
        uint256 _debtIncrease
    ) external override returns (uint) {}

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

    function getBorrowingRate() external view override returns (uint) {}

    function getBorrowingRateWithDecay()
        external
        view
        override
        returns (uint)
    {}

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
    ) external view override returns (bool) {}
}
