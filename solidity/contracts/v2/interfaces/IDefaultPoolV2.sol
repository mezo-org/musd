// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPoolV2.sol";

interface IDefaultPoolV2 is IPoolV2 {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolMUSDDebtUpdated(uint256 _MUSDDebt);
    event DefaultPoolCollateralBalanceUpdated(uint256 _collateral);
    event CollateralAddressChanged(address _newCollateralAddress);

    // --- Functions ---
    function sendCollateralToActivePool(uint256 _amount) external;

    function updateCollateralBalance(uint256 _amount) external;

    function collateralAddress() external view returns (address);
}
