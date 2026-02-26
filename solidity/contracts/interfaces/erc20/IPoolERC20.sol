// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

interface IPoolERC20 {
    // --- Events ---

    event CollateralSent(address _to, uint256 _amount);

    // --- Functions ---

    function getCollateralBalance() external view returns (uint256);

    function getDebt() external view returns (uint256);

    function getPrincipal() external view returns (uint256);

    function getInterest() external view returns (uint256);

    function increaseDebt(uint256 _principal, uint256 _interest) external;

    function decreaseDebt(uint256 _principal, uint256 _interest) external;

    function collateralToken() external view returns (address);
}
