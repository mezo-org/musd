// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "../../BorrowerOperations.sol";

contract BorrowerOperationsV2 is BorrowerOperations {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 885;
    }

    function newFunction() external {
        newField++;
    }
}
