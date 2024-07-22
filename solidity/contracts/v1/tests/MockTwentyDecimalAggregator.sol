// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import "../interfaces/ChainlinkAggregatorV3Interface.sol";
import "../interfaces/IPriceFeed.sol";

contract MockTwentyDecimalAggregator is ChainlinkAggregatorV3Interface {
    function decimals() external pure returns (uint8) {
        return 20;
    }

    function latestRoundData()
        external
        pure
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // 42 in 20 decimal precision
        return (0, 42 * (10 ** 20), 0, 0, 0);
    }
}
