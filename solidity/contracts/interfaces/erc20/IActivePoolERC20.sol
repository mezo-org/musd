// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "./IPoolERC20.sol";

interface IActivePoolERC20 is IPoolERC20 {
    // --- Events ---
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event CollSurplusPoolAddressChanged(address _newCollSurplusPoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
    event InterestRateManagerAddressChanged(
        address _interestRateManagerAddress
    );
    event StabilityPoolAddressChanged(address _stabilityPoolAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);

    event ActivePoolDebtUpdated(uint256 _principal, uint256 _interest);
    event ActivePoolCollateralBalanceUpdated(uint256 _collateral);

    // --- Functions ---
    function sendCollateral(address _account, uint256 _amount) external;

    function receiveCollateral(uint256 _amount) external;

    function setAddresses(
        address _collateralToken,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress,
        address _troveManagerAddress
    ) external;
}
