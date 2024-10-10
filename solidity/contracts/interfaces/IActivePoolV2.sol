// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./IPoolV2.sol";

interface IActivePoolV2 is IPoolV2 {
    // --- Events ---
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolMUSDDebtUpdated(uint256 _MUSDDebt);
    event ActivePoolCollateralBalanceUpdated(uint256 _collateral);
    event CollateralAddressChanged(address _newCollateralAddress);
    event CollSurplusPoolAddressChanged(address _newCollSurplusPoolAddress);

    // --- Functions ---
    function sendCollateral(address _account, uint256 _amount) external;

    function collateralAddress() external view returns (address);
}
