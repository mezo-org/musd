// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "../../PCV.sol";

contract PCVv2 is PCV {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 60;
    }

    function newFunction() external {
        newField++;
    }
}
