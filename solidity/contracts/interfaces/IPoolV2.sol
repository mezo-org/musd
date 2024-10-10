// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

// Common interface for the Pools.
interface IPoolV2 {
    // --- Events ---

    event CollateralBalanceUpdated(uint256 _newBalance);
    event MUSDBalanceUpdated(uint256 _newBalance);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event CollateralSent(address _to, uint256 _amount);

    // --- Functions ---

    function increaseMUSDDebt(uint256 _amount) external;

    function decreaseMUSDDebt(uint256 _amount) external;

    function getCollateralBalance() external view returns (uint);

    function getMUSDDebt() external view returns (uint);
}
