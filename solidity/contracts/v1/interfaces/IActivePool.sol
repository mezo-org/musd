// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPool.sol";

interface IActivePool is IPool {
    // --- Events ---
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolMUSDDebtUpdated(uint256 _MUSDDebt);
    event ActivePoolCollateralBalanceUpdated(uint256 _collateral);
    event CollSurplusPoolAddressChanged(address _newCollSurplusPoolAddress);

    // --- Functions ---
    function sendCollateral(address _account, uint256 _amount) external;
}
