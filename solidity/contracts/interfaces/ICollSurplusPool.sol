// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface ICollSurplusPool {
    // --- Events ---

    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);

    event CollBalanceUpdated(address indexed _account, uint256 _newBalance);
    event CollateralSent(address _to, uint256 _amount);

    // --- Contract setters ---

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _troveManagerAddress
    ) external;

    function accountSurplus(address _account, uint256 _amount) external;

    function claimColl(address _account, address _recipient) external;

    function getCollateralBalance() external view returns (uint);

    function getCollateral(address _account) external view returns (uint);
}
