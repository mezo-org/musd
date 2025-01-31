// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import "../interfaces/ChainlinkAggregatorV3Interface.sol";
import "../interfaces/IPriceFeed.sol";

contract PriceFeedUpgradeTester is
    IPriceFeed,
    Initializable,
    Ownable2StepUpgradeable
{
    // slither-disable-next-line constable-states
    ChainlinkAggregatorV3Interface public oracle;

    // slither-disable-next-line unused-state
    uint256[50] private __gap;

    function initialize(address _owner) external virtual initializer {
        __Ownable_init(_owner);
    }

    function setOracle(address _oracle) external onlyOwner {}

    function fetchPrice() public view virtual returns (uint256) {
        return 45000e18;
    }
}
