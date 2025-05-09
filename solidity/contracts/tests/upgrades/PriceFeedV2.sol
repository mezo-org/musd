// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../../PriceFeed.sol";

contract PriceFeedV2 is PriceFeed {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 397;
    }

    function newFunction() external {
        newField++;
    }
}
