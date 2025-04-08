// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import "../interfaces/ChainlinkAggregatorV3Interface.sol";

import "../dependencies/Ownable.sol";

contract MockAggregator is ChainlinkAggregatorV3Interface, Ownable {
    uint256 private _price;
    uint8 private precision;
    uint256 private blockTime;

    constructor(uint8 _decimals) Ownable(msg.sender) {
        precision = _decimals;
        uint256 multiplier = 10 ** uint8(precision);
        _price = 50000 * multiplier;
    }

    // Manual external price setter.
    function setPrice(uint256 price) external returns (bool) {
        // slither-disable-next-line events-maths
        _price = price;
        return true;
    }

    function setPrecision(uint8 _precision) external onlyOwner returns (bool) {
        uint256 oldMultiplier = 10 ** uint8(precision);
        uint256 basePrice = uint256(_price / oldMultiplier);
        uint256 multiplier = 10 ** uint8(_precision);
        // slither-disable-start events-maths
        _price = basePrice * multiplier;
        precision = _precision;
        // slither-disable-end events-maths
        return true;
    }

    function setBlockTime(uint256 _blockTime) external onlyOwner {
        // slither-disable-next-line events-maths
        blockTime = _blockTime;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        require(precision <= 77, "Decimals too large"); // Prevent overflow
        uint256 updatedAt = blockTime;
        if (updatedAt == 0) {
            // solhint-disable-next-line not-rely-on-time
            updatedAt = block.timestamp;
        }
        int256 answer = int256(_price);
        return (0, answer, updatedAt, updatedAt, 0);
    }

    function decimals() public view returns (uint8) {
        return precision;
    }
}
