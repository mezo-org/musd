// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "./IPoolERC20.sol";

interface IActivePoolERC20 is IPoolERC20 {
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

    function setAddresses(
        address _collateralTokenAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external;
}
