// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import "../interfaces/IPriceFeed.sol";
import "../interfaces/ChainlinkAggregatorV3Interface.sol";

contract MockEighteenDecimalAggregator is ChainlinkAggregatorV3Interface {
    function decimals() external pure returns (uint8) {
        return 18;
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
        // 42 in 18 decimal precision
        return (0, 42 * (10 ** 18), 0, 0, 0);
    }
}
