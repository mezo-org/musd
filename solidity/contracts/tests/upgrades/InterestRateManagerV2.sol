// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../../InterestRateManager.sol";

contract InterestRateManagerV2 is InterestRateManager {
    uint256 public newField;

    function initializeV2() external reinitializer(2) {
        newField = 880;
    }

    function newFunction() external {
        newField++;
    }
}
