// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IDefaultPool.sol";

/*
 * The Default Pool holds the collateral and THUSD debt (but not THUSD tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending collateral and THUSD debt, its pending collateral and THUSD debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, SendCollateral, IDefaultPool {
    constructor() Ownable(msg.sender) {}

    function increaseMUSDDebt(uint256 _amount) external override {}

    function decreaseMUSDDebt(uint256 _amount) external override {}

    function sendCollateralToActivePool(uint256 _amount) external override {}

    function updateCollateralBalance(uint256 _amount) external override {}

    function getCollateralBalance() external view override returns (uint) {}

    function getMUSDDebt() external view override returns (uint) {}

    function collateralAddress() external view override returns (address) {}
}
