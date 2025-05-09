// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../../CollSurplusPool.sol";

contract CollSurplusPoolV2 is CollSurplusPool {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 101;
    }

    function newFunction() external {
        newField++;
    }
}
