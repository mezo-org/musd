// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../../HintHelpers.sol";

contract HintHelpersV2 is HintHelpers {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 254;
    }

    function newFunction() external {
        newField++;
    }
}
