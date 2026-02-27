// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "./IPoolERC20.sol";

/**
 * @title IDefaultPoolERC20
 * @notice Interface for DefaultPool with ERC20 collateral
 */
interface IDefaultPoolERC20 is IPoolERC20 {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolDebtUpdated(uint256 _principal, uint256 _interest);
    event DefaultPoolCollateralBalanceUpdated(uint256 _collateral);

    // --- Functions ---
    function sendCollateralToActivePool(uint256 _amount) external;

    function setAddresses(
        address _activePoolAddress,
        address _troveManagerAddress
    ) external;
}
