// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import "../interfaces/ChainlinkAggregatorV3InterfaceV2.sol";
import "../interfaces/IPriceFeedV2.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockAggregatorV2 is ChainlinkAggregatorV3InterfaceV2, Ownable {
    uint256 private _price;
    uint8 private immutable precision;

    constructor(uint8 _decimals) Ownable(msg.sender) {
        precision = _decimals;
        _price = 50000 * 1e18;
    }

    // Manual external price setter.
    function setPrice(uint256 price) external returns (bool) {
        // slither-disable-next-line events-maths
        _price = price;
        return true;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(precision <= 77, "Decimals too large"); // Prevent overflow

        uint256 basePrice = uint256(_price / 1e18);
        uint256 multiplier = 10 ** uint8(precision);
        int256 adjustedPrice = int256(basePrice * multiplier);

        return (0, adjustedPrice, 0, 0, 0);
    }

    function decimals() public view returns (uint8) {
        return precision;
    }
}
