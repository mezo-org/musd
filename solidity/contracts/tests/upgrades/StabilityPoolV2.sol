// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../../StabilityPool.sol";

contract StabilityPoolV2 is StabilityPool {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 700;
    }

    function newFunction() external {
        newField++;
    }
}
