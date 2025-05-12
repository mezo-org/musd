// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "../../TroveManager.sol";

contract TroveManagerV2 is TroveManager {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 999;
    }

    function newFunction() external {
        newField++;
    }
}
