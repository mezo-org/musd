// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/ICollSurplusPool.sol";

contract CollSurplusPool is
    Ownable,
    CheckContract,
    SendCollateral,
    ICollSurplusPool
{
    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _collateralAddress
    ) external override {}

    function accountSurplus(
        address _account,
        uint256 _amount
    ) external override {}

    function claimColl(address _account) external override {}

    function updateCollateralBalance(uint256 _amount) external override {}

    function collateralAddress() external view override returns (address) {}

    function getCollateralBalance() external view override returns (uint) {}

    function getCollateral(
        address _account
    ) external view override returns (uint) {}
}
