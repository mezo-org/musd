// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IStabilityPool.sol";
import "./IPCV.sol";

// Common interface for the Trove Manager.
interface ITroveManager {
    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

    struct InterestRateChange {
        uint16 interestRate;
        uint256 blockNumber;
    }

    // --- Events ---

    event ActivePoolAddressChanged(address _activePoolAddress);
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event InterestRateManagerAddressChanged(
        address _interestRateManagerAddress
    );
    event MUSDTokenAddressChanged(address _newMUSDTokenAddress);
    event PCVAddressChanged(address _pcvAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);

    event Liquidation(
        uint256 _liquidatedPrincipal,
        uint256 _liquidatedInterest,
        uint256 _liquidatedColl,
        uint256 _collGasCompensation,
        uint256 _gasCompensation
    );
    event Redemption(
        uint256 _attemptedAmount,
        uint256 _actualAmount,
        uint256 _collateralSent,
        uint256 _collateralFee
    );
    event TroveUpdated(
        address indexed _borrower,
        uint256 _principal,
        uint256 _interest,
        uint256 _coll,
        uint256 stake,
        uint8 operation
    );
    event TroveLiquidated(
        address indexed _borrower,
        uint256 _debt,
        uint256 _coll,
        uint8 operation
    );
    event BaseRateUpdated(uint256 _baseRate);
    event TotalStakesUpdated(uint256 _newTotalStakes);
    event SystemSnapshotsUpdated(
        uint256 _totalStakesSnapshot,
        uint256 _totalCollateralSnapshot
    );
    event LTermsUpdated(
        uint256 _L_Collateral,
        uint256 _L_Principal,
        uint256 _L_Interest
    );
    event TroveSnapshotsUpdated(
        uint256 _L_Collateral,
        uint256 _L_Principal,
        uint256 _L_Interest
    );
    event TroveIndexUpdated(address _borrower, uint256 _newIndex);

    // --- Functions ---

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
    ) external;

    function liquidate(address _borrower) external;

    function batchLiquidateTroves(address[] calldata _troveArray) external;

    function redeemCollateral(
        uint256 _amount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint256 _partialRedemptionHintNICR,
        uint256 _maxIterations
    ) external;

    function updateStakeAndTotalStakes(
        address _borrower
    ) external returns (uint);

    function updateTroveRewardSnapshots(address _borrower) external;

    function addTroveOwnerToArray(
        address _borrower
    ) external returns (uint256 index);

    function applyPendingRewards(address _borrower) external;

    function closeTrove(address _borrower) external;

    function removeStake(address _borrower) external;

    function setTroveStatus(address _borrower, Status _status) external;

    function setTroveMaxBorrowingCapacity(
        address _borrower,
        uint256 _maxBorrowingCapacity
    ) external;

    function updateDefaultPoolInterest() external;

    function updateSystemAndTroveInterest(address _borrower) external;

    function increaseTroveColl(
        address _borrower,
        uint256 _collIncrease
    ) external returns (uint);

    function decreaseTroveColl(
        address _borrower,
        uint256 _collDecrease
    ) external returns (uint);

    function increaseTroveDebt(
        address _borrower,
        uint256 _debtIncrease
    ) external returns (uint256);

    function decreaseTroveDebt(
        address _borrower,
        uint256 _debtDecrease
    ) external returns (uint256, uint256);

    function setTroveInterestRate(address _borrower, uint16 _rate) external;

    function setTroveLastInterestUpdateTime(
        address _borrower,
        uint256 _timestamp
    ) external;

    function stabilityPool() external view returns (IStabilityPool);

    function pcv() external view returns (IPCV);

    function getTroveOwnersCount() external view returns (uint);

    function getTroveFromTroveOwnersArray(
        uint256 _index
    ) external view returns (address);

    function getTroveInterestOwed(
        address _borrower
    ) external view returns (uint256);

    function getTrovePrincipal(address _borrower) external view returns (uint);

    function getNominalICR(address _borrower) external view returns (uint);

    function getCurrentICR(
        address _borrower,
        uint256 _price
    ) external view returns (uint);

    function getPendingCollateral(
        address _borrower
    ) external view returns (uint);

    function getPendingDebt(
        address _borrower
    ) external view returns (uint256, uint256);

    function hasPendingRewards(address _borrower) external view returns (bool);

    function getEntireDebtAndColl(
        address _borrower
    )
        external
        view
        returns (
            uint256 coll,
            uint256 principal,
            uint256 interest,
            uint256 pendingCollateral,
            uint256 pendingPrincipal,
            uint256 pendingInterest
        );

    function getTroveStatus(address _borrower) external view returns (Status);

    function getTroveStake(address _borrower) external view returns (uint);

    function getTroveDebt(address _borrower) external view returns (uint);

    function getTroveInterestRate(
        address _borrower
    ) external view returns (uint16);

    function getTroveLastInterestUpdateTime(
        address _borrower
    ) external view returns (uint);

    function getTroveColl(address _borrower) external view returns (uint);

    function getTCR(uint256 _price) external view returns (uint);

    function getTroveMaxBorrowingCapacity(
        address _borrower
    ) external view returns (uint256);

    function checkRecoveryMode(uint256 _price) external view returns (bool);

    function getBorrowingFee(uint256 _debt) external pure returns (uint);
}
