// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IActivePool.sol";

/*
 * The Active Pool holds the collateral and THUSD debt (but not THUSD tokens) for all active troves.
 *
 * When a trove is liquidated, it's collateral and THUSD debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, SendCollateral, IActivePool {
    constructor() Ownable(msg.sender) {}

    function increaseMUSDDebt(uint256 _amount) external override {}

    function decreaseMUSDDebt(uint256 _amount) external override {}

    function sendCollateral(
        address _account,
        uint256 _amount
    ) external override {}

    function updateCollateralBalance(uint256 _amount) external override {}

    function collateralAddress() external view override returns (address) {}

    function getCollateralBalance() external view override returns (uint) {}

    function getMUSDDebt() external view override returns (uint) {}
}
