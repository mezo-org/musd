// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../../DefaultPool.sol";

contract DefaultPoolV2 is DefaultPool {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 212;
    }

    function newFunction() external {
        newField++;
    }
}
