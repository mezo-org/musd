// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "./IGovernableVariables.sol";

// Common interface for the Trove Manager.
interface IBorrowerOperations {
    // --- Events ---

    event ActivePoolAddressChanged(address _activePoolAddress);
    event BorrowingRateChanged(uint256 borrowingRate);
    event BorrowingRateProposed(
        uint256 proposedBorrowingRate,
        uint256 proposedBorrowingRateTime
    );
    event BorrowerOperationsSignaturesAddressChanged(
        address _borrowerOperationsSignaturesAddress
    );
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event GovernableVariablesAddressChanged(
        address _governableVariablesAddress
    );
    event InterestRateManagerAddressChanged(
        address _interestRateManagerAddress
    );
    event MUSDTokenAddressChanged(address _musdTokenAddress);
    event MinNetDebtChanged(uint256 _minNetDebt);
    event MinNetDebtProposed(uint256 _minNetDebt, uint256 _proposalTime);
    event PCVAddressChanged(address _pcvAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event RedemptionRateChanged(uint256 redemptionRate);
    event RedemptionRateProposed(
        uint256 proposedRedemptionRate,
        uint256 proposedRedemptionRateTime
    );
    event RefinancingFeePercentageChanged(uint8 _refinanceFeePercentage);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event TroveCreated(address indexed _borrower, uint256 arrayIndex);
    event TroveUpdated(
        address indexed _borrower,
        uint256 _principal,
        uint256 _interest,
        uint256 _coll,
        uint256 _stake,
        uint16 _interestRate,
        uint256 _lastInterestUpdateTime,
        uint8 _operation
    );
    event BorrowingFeePaid(address indexed _borrower, uint256 _fee);
    event RefinancingFeePaid(address indexed _borrower, uint256 _fee);

    // --- Functions ---

    function setAddresses(address[13] memory addresses) external;

    function setRefinancingFeePercentage(
        uint8 _refinanceFeePercentage
    ) external;

    function openTrove(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function restrictedOpenTrove(
        address _borrower,
        address _recipient,
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function proposeMinNetDebt(uint256 _minNetDebt) external;

    function approveMinNetDebt() external;

    function proposeBorrowingRate(uint256 _fee) external;

    function approveBorrowingRate() external;

    function proposeRedemptionRate(uint256 _fee) external;

    function approveRedemptionRate() external;

    function addColl(address _upperHint, address _lowerHint) external payable;

    function moveCollateralGainToTrove(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function withdrawMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function closeTrove() external;

    function restrictedCloseTrove(
        address _borrower,
        address _caller,
        address _recipient
    ) external;

    function refinance(address _upperHint, address _lowerHint) external;

    function restrictedRefinance(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external;

    function adjustTrove(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function restrictedAdjustTrove(
        address _borrower,
        address _recipient,
        address _caller,
        uint256 _collWithdrawal,
        uint256 _mUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function claimCollateral() external;

    function restrictedClaimCollateral(
        address _borrower,
        address _recipient
    ) external;

    function governableVariables() external view returns (IGovernableVariables);

    function getBorrowingFee(uint256 _debt) external view returns (uint);

    function getRedemptionRate(
        uint256 _collateralDrawn
    ) external view returns (uint256);

    function minNetDebt() external view returns (uint256);
}
