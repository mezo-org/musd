// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

/**
 * @title IPoolERC20
 * @notice Common interface for ERC20 collateral pools
 */
interface IPoolERC20 {
    // --- Events ---

    event CollateralBalanceUpdated(uint256 _newBalance);

    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);

    event CollateralSent(address _to, uint256 _amount);
    event CollateralReceived(address _from, uint256 _amount);

    // --- Functions ---

    function increaseDebt(uint256 _principal, uint256 _interest) external;

    function decreaseDebt(uint256 _principal, uint256 _interest) external;

    function getCollateralBalance() external view returns (uint256);

    function getDebt() external view returns (uint256);

    function getPrincipal() external view returns (uint256);

    function getInterest() external view returns (uint256);

    function receiveCollateral(uint256 _amount) external;
}
