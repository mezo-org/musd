// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

// Common interface for the Pools.
interface IPool {
    // --- Events ---

    event CollateralBalanceUpdated(uint256 _newBalance);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event CollateralSent(address _to, uint256 _amount);

    // --- Functions ---

    function increaseDebt(uint256 _principal, uint256 _interest) external;

    function decreaseDebt(uint256 _principal, uint256 _interest) external;

    function getCollateralBalance() external view returns (uint);

    function getDebt() external view returns (uint);

    function getPrincipal() external view returns (uint);

    function getInterest() external view returns (uint);
}
