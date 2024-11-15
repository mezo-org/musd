// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolMUSDDebtUpdated(uint256 _principal, uint256 _interest);
    event DefaultPoolCollateralBalanceUpdated(uint256 _collateral);
    event CollateralAddressChanged(address _newCollateralAddress);

    // --- Functions ---
    function sendCollateralToActivePool(uint256 _amount) external;

    function collateralAddress() external view returns (address);
}
