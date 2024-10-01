// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

interface IPriceFeed {
    // --- Events ---
    event LastGoodPriceUpdated(uint256 _lastGoodPrice);

    event NewOracleRegistered(address _oracle);

    // --- Function ---
    function fetchPrice() external returns (uint);

    function setOracle(address _oracle) external;
}
