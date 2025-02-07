// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

// Common interface for the Trove Manager.
interface IBorrowerOperations {
    // --- Events ---

    event ActivePoolAddressChanged(address _activePoolAddress);
    event CollSurplusPoolAddressChanged(address _collSurplusPoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event GasPoolAddressChanged(address _gasPoolAddress);
    event MUSDTokenAddressChanged(address _musdTokenAddress);
    event MinNetDebtChanged(uint256 _minNetDebt);
    event MinNetDebtProposed(uint256 _minNetDebt, uint256 _proposalTime);
    event PCVAddressChanged(address _pcvAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);

    event TroveCreated(address indexed _borrower, uint256 arrayIndex);
    event TroveUpdated(
        address indexed _borrower,
        uint256 _principal,
        uint256 _interest,
        uint256 _coll,
        uint256 stake,
        uint8 operation
    );
    event BorrowingFeePaid(address indexed _borrower, uint256 _fee);
    event RefinancingFeePaid(address indexed _borrower, uint256 _fee);

    // --- Functions ---

    function setAddresses(
        address _activePoolAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _gasPoolAddress,
        address _interestRateManagerAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external;

    function setRefinancingFeePercentage(
        uint8 _refinanceFeePercentage
    ) external;

    function openTrove(
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function openTroveWithSignature(
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function proposeMinNetDebt(uint256 _minNetDebt) external;

    function approveMinNetDebt() external;

    function repayMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function addColl(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function addCollWithSignature(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function withdrawCollWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function withdrawMUSD(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function withdrawMUSDWithSignature(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function closeTrove() external;

    function closeTroveWithSignature(
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function refinance(uint256 _maxFeePercentage) external;

    function refinanceWithSignature(
        uint256 _maxFeePercentage,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function adjustTrove(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function adjustTroveWithSignature(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function claimCollateral() external;

    function minNetDebt() external view returns (uint256);

    function getCompositeDebt(uint256 _debt) external pure returns (uint);
}
