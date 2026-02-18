// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

interface ICollSurplusPoolERC20 {
    // --- Events ---
    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _activePoolAddress);
    event CollBalanceUpdated(address indexed _account, uint256 _newBalance);
    event CollateralSent(address _to, uint256 _amount);

    // --- Functions ---
    function setAddresses(
        address _collateralToken,
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _troveManagerAddress
    ) external;

    function getCollateral(address _account) external view returns (uint256);

    function getCollateralBalance() external view returns (uint256);

    function accountSurplus(address _account, uint256 _amount) external;

    function claimColl(address _account, address _recipient) external;

    function receiveCollateral(uint256 _amount) external;

    function collateralToken() external view returns (address);
}
