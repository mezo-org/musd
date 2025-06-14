// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface IBorrowerOperationsSignatures {
    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress
    ) external;

    function setPoolAddresses(
        address _activePoolAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress
    ) external;

    function addCollWithSignature(
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function closeTroveWithSignature(
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function claimCollateralWithSignature(
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function adjustTroveWithSignature(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function withdrawCollWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function openTroveWithSignature(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function withdrawMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function repayMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function refinanceWithSignature(
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function getNonce(address user) external view returns (uint256);
}
