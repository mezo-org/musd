// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface IPriceFeed {
    // --- Events ---
    event LastGoodPriceUpdated(uint256 _lastGoodPrice);

    event NewOracleRegistered(address _oracle);

    // --- Function ---
    function setOracle(address _oracle) external;

    function fetchPrice() external view returns (uint);
}
