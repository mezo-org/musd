// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "./IPoolERC20.sol";

interface IDefaultPoolERC20 is IPoolERC20 {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _activePoolAddress);
    event DefaultPoolDebtUpdated(uint256 _principal, uint256 _interest);
    event DefaultPoolCollateralBalanceUpdated(uint256 _collateral);

    // --- Functions ---
    function sendCollateralToActivePool(uint256 _amount) external;

    function receiveCollateral(uint256 _amount) external;

    function setAddresses(
        address _collateralToken,
        address _activePoolAddress,
        address _troveManagerAddress
    ) external;
}
