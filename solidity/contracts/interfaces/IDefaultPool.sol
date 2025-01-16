// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolDebtUpdated(uint256 _principal, uint256 _interest);
    event DefaultPoolCollateralBalanceUpdated(uint256 _collateral);

    // --- Functions ---
    function sendCollateralToActivePool(uint256 _amount) external;

    function getLastInterestUpdatedTime() external view returns (uint);
}
