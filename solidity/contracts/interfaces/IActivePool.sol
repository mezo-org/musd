// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPool.sol";

interface IActivePool is IPool {
    // --- Events ---
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event CollSurplusPoolAddressChanged(address _newCollSurplusPoolAddress);
    event InterestRateManagerAddressChanged(
        address _interestRateManagerAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);

    event ActivePoolDebtUpdated(uint256 _principal, uint256 _interest);
    event ActivePoolCollateralBalanceUpdated(uint256 _collateral);

    // --- Functions ---
    function sendCollateral(address _account, uint256 _amount) external;
}
