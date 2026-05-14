// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICollSurplusPoolERC20 {
    // --- Events ---

    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);

    event CollBalanceUpdated(address indexed _account, uint256 _newBalance);
    event CollateralSent(address _to, uint256 _amount);
    event CollateralReceived(address _from, uint256 _amount);

    // --- Functions ---

    function setAddresses(
        address _collateralTokenAddress,
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _troveManagerAddress
    ) external;

    function receiveCollateral(uint256 _amount) external;

    function accountSurplus(address _account, uint256 _amount) external;

    function claimColl(address _account, address _recipient) external;

    function collateralToken() external view returns (IERC20);

    function getCollateralBalance() external view returns (uint);

    function getCollateral(address _account) external view returns (uint);
}
