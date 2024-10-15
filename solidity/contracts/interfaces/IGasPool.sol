// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IGasPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event MUSDTokenAddressChanged(address _musdTokenAddress);

    // --- Functions ---
    function sendMUSD(address _account, uint256 _amount) external;
}
