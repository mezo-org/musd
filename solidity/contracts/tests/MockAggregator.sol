// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import "../interfaces/ChainlinkAggregatorV3Interface.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockAggregator is ChainlinkAggregatorV3Interface, Ownable {
    uint256 private _price;
    uint8 private precision;

    constructor(uint8 _decimals) Ownable(msg.sender) {
        precision = _decimals;
        uint256 multiplier = 10 ** uint8(precision);
        _price = 50000 * multiplier;
    }

    // Manual external price setter.
    function setPrice(uint256 price) external onlyOwner returns (bool) {
        // slither-disable-next-line events-maths
        _price = price;
        return true;
    }

    function setPrecision(uint8 _precision) external onlyOwner returns (bool) {
        uint256 oldMultiplier = 10 ** uint8(precision);
        uint256 basePrice = uint256(_price / oldMultiplier);
        uint256 multiplier = 10 ** uint8(_precision);
        _price = basePrice * multiplier;
        precision = _precision;
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

        return (0, int256(_price), 0, 0, 0);
    }

    function decimals() public view returns (uint8) {
        return precision;
    }
}
