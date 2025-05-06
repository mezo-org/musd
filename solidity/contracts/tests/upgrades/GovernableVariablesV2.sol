// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../../GovernableVariables.sol";

contract GovernableVariablesV2 is GovernableVariables {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 171;
    }

    function newFunction() external {
        newField++;
    }
}
