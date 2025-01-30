// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/ChainlinkAggregatorV3Interface.sol";
import "../interfaces/IPriceFeed.sol";

contract PriceFeedUpgradeTester is
    IPriceFeed,
    Initializable,
    OwnableUpgradeable
{
    ChainlinkAggregatorV3Interface public oracle;

    // slither-disable-next-line unused-state
    uint256[50] private __gap;

    function initialize(address _owner) external virtual initializer {
        __Ownable_init_unchained(_owner);
    }

    function setOracle(address _oracle) external onlyOwner {}

    function fetchPrice() public view virtual returns (uint256) {
        // $45k
        return 45000000000000000000000;
    }
}
