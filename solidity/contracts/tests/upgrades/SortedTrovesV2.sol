// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../../SortedTroves.sol";

contract SortedTrovesV2 is SortedTroves {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 700;
    }

    function newFunction() external {
        newField++;
    }
}
