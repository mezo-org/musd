// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolMUSDDebtUpdated(uint256 _MUSDDebt);
    event DefaultPoolCollateralBalanceUpdated(uint256 _collateral);

    // --- Functions ---
    function sendCollateralToActivePool(uint256 _amount) external;
}
