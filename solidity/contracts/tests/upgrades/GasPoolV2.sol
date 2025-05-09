// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../../GasPool.sol";

contract GasPoolV2 is GasPool {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 144;
    }

    function newFunction() external {
        newField++;
    }
}
