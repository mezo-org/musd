// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "../../ActivePool.sol";

contract ActivePoolV2 is ActivePool {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 609;
    }

    function newFunction() external {
        newField++;
    }
}
