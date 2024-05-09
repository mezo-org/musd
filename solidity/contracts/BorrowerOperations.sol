// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IMUSD.sol";
import "./interfaces/IBorrowerOperations.sol";

contract BorrowerOperations is
    Ownable,
    CheckContract,
    SendCollateral,
    IBorrowerOperations
{
    constructor() Ownable(msg.sender) {}

    // --- Borrower Trove Operations ---
    function openTrove(
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Send collateral to a trove
    function addColl(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Send collateral to a trove. Called by only the Stability Pool.
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Withdraw collateral from a trove
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    // Withdraw MUSD tokens from a trove: mint new MUSD tokens to the owner, and increase the trove's debt accordingly
    function withdrawMUSD(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    // Repay MUSD tokens to a Trove: Burn the repaid MUSD tokens, and reduce the trove's debt accordingly
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    function closeTrove() external override {}

    function adjustTrove(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
    function claimCollateral() external override {}

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _collateralAddress
    ) external override {}

    function collateralAddress() external view override returns (address) {}

    function getCompositeDebt(
        uint256 _debt
    ) external pure override returns (uint) {
        return _debt;
    }
}
